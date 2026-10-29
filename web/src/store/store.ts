import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api, ApiError, setUnauthorizedHandler } from '@/lib/api';
import { extractUrls, hostOf } from '@/lib/format';
import { newId } from '@/lib/ids';
import { openItem } from '@/lib/items';
import { childFolders, itemsInFolder } from '@/lib/tree';
import { sameLinkElsewhere } from '@/lib/urls';
import type {
  AppInfo,
  ChangeSet,
  Folder,
  Highlight,
  HighlightColor,
  Item,
  Snapshot,
  Space,
  Tag,
  User,
} from '@/lib/types';

type State = {
  authStatus: 'loading' | 'signedOut' | 'signedIn';
  user: User | null;
  appInfo: AppInfo | null;
  spaces: Space[];
  // The space whose data is loaded below.
  spaceId: string | null;
  seq: number;
  loading: boolean;
  folders: Record<string, Folder>;
  items: Record<string, Item>;
  tags: Record<string, Tag>;
  highlights: Record<string, Highlight>;
  selection: string[];
};

const empty = { spaceId: null, seq: 0, folders: {}, items: {}, tags: {}, highlights: {}, selection: [] };

export const useStore = create<State>(() => ({
  authStatus: 'loading',
  user: null,
  appInfo: null,
  spaces: [],
  loading: false,
  ...empty,
}));

const set = useStore.setState;
const get = useStore.getState;

const byId = <T extends { id: string }>(rows: T[]) => Object.fromEntries(rows.map((row) => [row.id, row]));
const without = <T>(map: Record<string, T>, ids: string[]) => {
  const next = { ...map };
  for (const id of ids) delete next[id];
  return next;
};

// ---- Edits in flight ----
// While this device is saving a row, incoming sync data for it is ignored so the screen doesn't
// flicker back to the old value; once the save finishes we catch up again.
const inFlight = new Map<string, number>();

export async function save<T>(ids: string[], request: () => Promise<T>, rollback?: () => void): Promise<T | undefined> {
  ids.forEach((id) => inFlight.set(id, (inFlight.get(id) ?? 0) + 1));
  try {
    return await request();
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    if (rollback) rollback();
    else void reloadSpace();
    return undefined;
  } finally {
    ids.forEach((id) => {
      const count = (inFlight.get(id) ?? 1) - 1;
      if (count <= 0) inFlight.delete(id);
      else inFlight.set(id, count);
    });
    void catchUp();
  }
}

// ---- Session ----

setUnauthorizedHandler(() => {
  if (get().authStatus === 'signedIn') signedOut();
});

function signedOut() {
  stopSync();
  set({ authStatus: 'signedOut', user: null, spaces: [], ...empty });
}

export async function loadAppInfo() {
  try {
    set({ appInfo: await api.get<AppInfo>('/app-info') });
  } catch {
    // The sign-in page still works without it.
  }
}

export async function loadSession() {
  try {
    const me = await api.get<{ user: User; spaces: Space[] }>('/me');
    set({ authStatus: 'signedIn', user: me.user, spaces: me.spaces });
    startSync();
  } catch {
    signedOut();
  }
}

export async function login(loginName: string, password: string) {
  await api.post('/auth/login', { login: loginName, password });
  await loadSession();
}

export async function register(input: { username: string; email: string; password: string }) {
  await api.post('/auth/register', input);
  await loadSession();
}

export async function logout() {
  await api.post('/auth/logout').catch(() => {});
  signedOut();
}

// ---- Spaces and sync ----

const LAST_SPACE_KEY = 'linkr-last-space';

export function preferredSpaceId(): string | null {
  const { spaces } = get();
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_SPACE_KEY);
  } catch {
    // storage blocked
  }
  return spaces.find((space) => space.id === last)?.id ?? spaces[0]?.id ?? null;
}

export async function openSpace(spaceId: string, force = false) {
  if (!force && get().spaceId === spaceId) return;
  try {
    localStorage.setItem(LAST_SPACE_KEY, spaceId);
  } catch {
    // storage blocked
  }
  set({ loading: true, ...(get().spaceId !== spaceId ? empty : {}) });
  try {
    const snapshot = await api.get<Snapshot>(`/spaces/${spaceId}/snapshot`);
    set({
      spaceId,
      seq: snapshot.seq,
      folders: byId(snapshot.folders),
      items: byId(snapshot.items),
      tags: byId(snapshot.tags),
      highlights: byId(snapshot.highlights),
      loading: false,
    });
  } catch (error) {
    set({ loading: false });
    toast.error(error instanceof ApiError ? error.message : 'Could not open this space');
  }
}

const reloadSpace = () => {
  const { spaceId } = get();
  return spaceId ? openSpace(spaceId, true) : Promise.resolve();
};

let catchingUp: Promise<void> | null = null;
let catchUpAgain = false;

// Pulls only what changed since the last sequence number we saw.
export function catchUp(): Promise<void> {
  if (catchingUp) {
    catchUpAgain = true;
    return catchingUp;
  }
  catchingUp = (async () => {
    do {
      catchUpAgain = false;
      const { spaceId, seq } = get();
      if (!spaceId) return;
      let changes: ChangeSet;
      try {
        changes = await api.get<ChangeSet>(`/spaces/${spaceId}/changes?since=${seq}`);
      } catch {
        return;
      }
      if (get().spaceId !== spaceId) return;
      const keep = <T extends { id: string }>(rows: T[]) => rows.filter((row) => !inFlight.has(row.id));
      set((state) => ({
        seq: Math.max(state.seq, changes.seq),
        spaces: changes.space
          ? state.spaces.map((space) => (space.id === changes.space!.id ? { ...space, ...changes.space } : space))
          : state.spaces,
        folders: { ...without(state.folders, changes.deleted.folders), ...byId(keep(changes.folders)) },
        items: { ...without(state.items, changes.deleted.items), ...byId(keep(changes.items)) },
        tags: { ...without(state.tags, changes.deleted.tags), ...byId(keep(changes.tags)) },
        // Highlights go with their item when it's deleted for good, without a change of their own.
        highlights: Object.fromEntries(
          Object.entries({
            ...without(state.highlights, changes.deleted.highlights),
            ...byId(keep(changes.highlights)),
          }).filter(([, highlight]) => !changes.deleted.items.includes(highlight.itemId))
        ),
        selection: state.selection.filter((id) => !changes.deleted.items.includes(id)),
      }));
    } while (catchUpAgain);
  })().finally(() => {
    catchingUp = null;
  });
  return catchingUp;
}

let events: EventSource | null = null;

function startSync() {
  if (events) return;
  let connectedBefore = false;
  events = new EventSource('/api/events');
  events.addEventListener('ready', () => {
    // Reconnected after sleep or a network change: we may have missed updates.
    if (connectedBefore) void catchUp();
    connectedBefore = true;
  });
  events.addEventListener('change', (event) => {
    const { spaceId, seq } = JSON.parse((event as MessageEvent).data) as { spaceId: string; seq: number };
    if (spaceId === get().spaceId && seq > get().seq) void catchUp();
  });
}

function stopSync() {
  events?.close();
  events = null;
}

export async function createSpace(name: string): Promise<Space | undefined> {
  const id = newId();
  const space = await save([id], () => api.post<Space>('/spaces', { id, name }));
  if (space) set((state) => ({ spaces: [...state.spaces, space] }));
  return space;
}

export async function updateSpace(id: string, patch: Partial<Pick<Space, 'name' | 'icon' | 'color'>>) {
  const before = get().spaces;
  set({ spaces: before.map((space) => (space.id === id ? { ...space, ...patch } : space)) });
  await save(
    [id],
    () => api.patch(`/spaces/${id}`, patch),
    () => set({ spaces: before })
  );
}

// ---- Folders ----

export async function createFolder(input: { parentId: string | null; title: string } & Partial<Folder>) {
  const { spaceId, folders } = get();
  if (!spaceId) return;
  const siblings = childFolders(folders, input.parentId);
  const now = new Date().toISOString();
  const folder: Folder = {
    id: newId(),
    spaceId,
    icon: null,
    color: null,
    sessionDate: null,
    term: null,
    view: {},
    body: null,
    notes: '',
    pinned: false,
    archivedAt: null,
    deletedAt: null,
    copiedFrom: null,
    createdAt: now,
    updatedAt: now,
    position: generateKeyBetween(siblings.at(-1)?.position ?? null, null),
    ...input,
  };
  set((state) => ({ folders: { ...state.folders, [folder.id]: folder } }));
  await save(
    [folder.id],
    () =>
      api.post('/folders', {
        id: folder.id,
        spaceId,
        parentId: folder.parentId,
        title: folder.title,
        icon: folder.icon,
        color: folder.color,
        position: folder.position,
        sessionDate: folder.sessionDate,
        term: folder.term,
      }),
    () => set((state) => ({ folders: without(state.folders, [folder.id]) }))
  );
  return folder;
}

type FolderPatch = Partial<
  Pick<
    Folder,
    'title' | 'icon' | 'color' | 'parentId' | 'position' | 'sessionDate' | 'term' | 'view' | 'pinned' | 'body' | 'notes'
  >
> & { archived?: boolean };

export async function updateFolder(id: string, patch: FolderPatch) {
  const before = get().folders[id];
  if (!before) return;
  const { archived, ...fields } = patch;
  const local: Folder = {
    ...before,
    ...fields,
    view: fields.view ? { ...before.view, ...fields.view } : before.view,
    ...(archived !== undefined ? { archivedAt: archived ? new Date().toISOString() : null } : {}),
  };
  set((state) => ({ folders: { ...state.folders, [id]: local } }));
  await save(
    [id],
    () => api.patch(`/folders/${id}`, patch),
    () => set((state) => ({ folders: { ...state.folders, [id]: before } }))
  );
}

export async function trashFolder(id: string) {
  const before = get().folders[id];
  if (!before) return;
  set((state) => ({ folders: { ...state.folders, [id]: { ...before, deletedAt: new Date().toISOString() } } }));
  await save(
    [id],
    () => api.post(`/folders/${id}/trash`),
    () => set((state) => ({ folders: { ...state.folders, [id]: before } }))
  );
}

export async function restoreFolder(id: string) {
  const before = get().folders[id];
  if (!before) return;
  set((state) => ({ folders: { ...state.folders, [id]: { ...before, deletedAt: null } } }));
  await save([id], () => api.post(`/folders/${id}/restore`));
}

export async function purgeFolder(id: string) {
  await save([id], () => api.delete(`/folders/${id}`));
}

// ---- Items ----

// Says where a link was saved before. If it's already in this folder, it isn't saved twice.
function alreadySaved(url: string, folderId: string | null): boolean {
  const { items, folders } = get();
  const others = sameLinkElsewhere(items, { id: '', url });
  if (others.length === 0) return false;
  const here = others.find((item) => item.folderId === folderId);
  const where = (item: Item) => (item.folderId ? (folders[item.folderId]?.title ?? 'a folder') : 'Inbox');
  const shown = here ?? others[0];
  toast(
    here
      ? 'Already saved in this folder'
      : `Also saved in ${where(shown)}${others.length > 1 ? ` and ${others.length - 1} more` : ''}`,
    {
      description: shown.title,
      action: { label: 'Open', onClick: () => openItem(shown) },
    }
  );
  return !!here;
}

// "Paste a link or type a note": each URL becomes a link; anything else becomes one note.
// Returns the new items' IDs.
export async function addFromText(text: string, folderId: string | null): Promise<string[]> {
  const urls = extractUrls(text)?.filter((url) => !alreadySaved(url, folderId)) ?? null;
  if (urls && urls.length === 0) return [];
  const created = urls
    ? await Promise.all([...urls].reverse().map((url) => createItem({ kind: 'link', url, folderId })))
    : [await createItem({ kind: 'note', notes: text.trim(), folderId })];
  return created.flatMap((item) => (item ? [item.id] : []));
}

export async function createItem(input: {
  kind: 'link' | 'note';
  url?: string;
  notes?: string;
  folderId: string | null;
}) {
  const { spaceId, items } = get();
  if (!spaceId) return;
  const first = itemsInFolder(items, input.folderId, 'manual')[0];
  const now = new Date().toISOString();
  const notes = input.notes ?? '';
  const item: Item = {
    id: newId(),
    spaceId,
    folderId: input.folderId,
    kind: input.kind,
    title: input.kind === 'link' ? hostOf(input.url ?? '') : notes.split('\n')[0].slice(0, 120) || 'Untitled note',
    url: input.url ?? '',
    description: '',
    notes,
    body: null,
    image: '',
    favicon: '',
    siteName: input.kind === 'link' ? hostOf(input.url ?? '') : '',
    color: null,
    pinned: false,
    position: generateKeyBetween(null, first?.position ?? null),
    fetchStatus: input.kind === 'link' ? 'pending' : 'done',
    frameable: null,
    file: null,
    tagIds: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  set((state) => ({ items: { ...state.items, [item.id]: item } }));
  await save(
    [item.id],
    () =>
      api.post('/items', {
        id: item.id,
        spaceId,
        kind: item.kind,
        url: item.url,
        notes: item.notes,
        folderId: item.folderId,
        position: item.position,
      }),
    () => set((state) => ({ items: without(state.items, [item.id]) }))
  );
  return item;
}

type ItemPatch = Partial<
  Pick<
    Item,
    'title' | 'url' | 'description' | 'notes' | 'body' | 'color' | 'pinned' | 'folderId' | 'position' | 'tagIds'
  >
>;

export async function updateItem(id: string, patch: ItemPatch) {
  const before = get().items[id];
  if (!before) return;
  set((state) => ({ items: { ...state.items, [id]: { ...before, ...patch } } }));
  await save(
    [id],
    () => api.patch(`/items/${id}`, patch),
    () => set((state) => ({ items: { ...state.items, [id]: before } }))
  );
}

export async function moveItems(ids: string[], folderId: string | null) {
  const { items } = get();
  const moving = ids.filter((id) => items[id] && items[id].folderId !== folderId);
  if (moving.length === 0) return;
  const first = itemsInFolder(items, folderId, 'manual')[0];
  const positions = generateNKeysBetween(null, first?.position ?? null, moving.length);
  const before = Object.fromEntries(moving.map((id) => [id, items[id]]));
  set((state) => ({
    items: {
      ...state.items,
      ...Object.fromEntries(moving.map((id, i) => [id, { ...state.items[id], folderId, position: positions[i] }])),
    },
    selection: [],
  }));
  await save(
    moving,
    () => api.post('/items/move', { ids: moving, folderId }),
    () => set((state) => ({ items: { ...state.items, ...before } }))
  );
}

function setDeleted(ids: string[], deletedAt: string | null) {
  set((state) => ({
    items: {
      ...state.items,
      ...Object.fromEntries(ids.filter((id) => state.items[id]).map((id) => [id, { ...state.items[id], deletedAt }])),
    },
    selection: state.selection.filter((id) => !ids.includes(id)),
  }));
}

export async function trashItems(ids: string[]) {
  if (ids.length === 0) return;
  setDeleted(ids, new Date().toISOString());
  await save(ids, () => api.post('/items/trash', { ids }));
  toast(`${ids.length === 1 ? 'Item' : `${ids.length} items`} moved to Trash`, {
    action: { label: 'Undo', onClick: () => void restoreItems(ids) },
  });
}

export async function restoreItems(ids: string[]) {
  setDeleted(ids, null);
  await save(ids, () => api.post('/items/restore', { ids }));
}

export async function purgeItems(ids: string[]) {
  if (ids.length === 0) return;
  set((state) => ({ items: without(state.items, ids) }));
  await save(ids, () => api.post('/items/purge', { ids }));
}

export async function refetchItem(id: string) {
  const before = get().items[id];
  if (!before) return;
  set((state) => ({ items: { ...state.items, [id]: { ...before, fetchStatus: 'pending' } } }));
  await save([id], () => api.post(`/items/${id}/refetch`));
}

// ---- Tags ----

export async function createTag(title: string): Promise<Tag | undefined> {
  const { spaceId, tags } = get();
  if (!spaceId) return;
  const existing = Object.values(tags).find((tag) => tag.title.toLowerCase() === title.trim().toLowerCase());
  if (existing) return existing;
  const tag: Tag = { id: newId(), spaceId, parentId: null, title: title.trim(), color: null };
  set((state) => ({ tags: { ...state.tags, [tag.id]: tag } }));
  const ok = await save(
    [tag.id],
    () => api.post('/tags', { id: tag.id, spaceId, title: tag.title }),
    () => set((state) => ({ tags: without(state.tags, [tag.id]) }))
  );
  return ok ? tag : undefined;
}

export async function deleteTag(id: string) {
  set((state) => ({
    tags: without(state.tags, [id]),
    items: Object.fromEntries(
      Object.entries(state.items).map(([key, item]) => [
        key,
        item.tagIds.includes(id) ? { ...item, tagIds: item.tagIds.filter((t) => t !== id) } : item,
      ])
    ),
  }));
  await save([id], () => api.delete(`/tags/${id}`));
}

// "Run again": copies a session for a new date or term. Returns the copy once the server has made it.
export async function runAgain(
  folderId: string,
  options: {
    title: string;
    sessionDate: string | null;
    term: string | null;
    parentId: string | null;
    subfolders: boolean;
    notes: boolean;
    highlights: boolean;
  }
): Promise<Folder | undefined> {
  const copy = await save([], () => api.post<Folder>(`/folders/${folderId}/run-again`, options));
  if (copy) set((state) => ({ folders: { ...state.folders, [copy.id]: copy } }));
  return copy;
}

// ---- Highlights ----

export type NewHighlight = Pick<Highlight, 'itemId' | 'quote' | 'prefix' | 'suffix' | 'start'> &
  Partial<Pick<Highlight, 'color' | 'comment'>>;

export async function createHighlight(input: NewHighlight): Promise<Highlight | undefined> {
  const { spaceId, user } = get();
  if (!spaceId) return;
  const now = new Date().toISOString();
  const highlight: Highlight = {
    id: newId(),
    spaceId,
    color: 'yellow',
    comment: '',
    createdBy: user?.id ?? null,
    createdAt: now,
    updatedAt: now,
    ...input,
  };
  set((state) => ({ highlights: { ...state.highlights, [highlight.id]: highlight } }));
  const saved = await save(
    [highlight.id],
    () => api.post('/highlights', { id: highlight.id, ...input }).then(() => true),
    () => set((state) => ({ highlights: without(state.highlights, [highlight.id]) }))
  );
  return saved ? highlight : undefined;
}

export async function updateHighlight(id: string, patch: { color?: HighlightColor; comment?: string }) {
  const before = get().highlights[id];
  if (!before) return;
  set((state) => ({ highlights: { ...state.highlights, [id]: { ...before, ...patch } } }));
  await save(
    [id],
    () => api.patch(`/highlights/${id}`, patch),
    () => set((state) => ({ highlights: { ...state.highlights, [id]: before } }))
  );
}

export async function deleteHighlight(id: string) {
  const before = get().highlights[id];
  if (!before) return;
  set((state) => ({ highlights: without(state.highlights, [id]) }));
  await save(
    [id],
    () => api.delete(`/highlights/${id}`),
    () => set((state) => ({ highlights: { ...state.highlights, [id]: before } }))
  );
}

// ---- Selection ----

export const setSelection = (ids: string[]) => set({ selection: ids });
export function toggleSelected(id: string) {
  set((state) => ({
    selection: state.selection.includes(id) ? state.selection.filter((s) => s !== id) : [...state.selection, id],
  }));
}
