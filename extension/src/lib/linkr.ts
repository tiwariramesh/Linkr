// Talking to the user's Linkr server, shared by the popup and the background worker.
// The connection (server address and this browser's token) lives in chrome.storage.local.

export type Color = 'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'indigo' | 'purple' | 'pink';
export type Role = 'owner' | 'editor' | 'viewer';
export type Space = { id: string; name: string; kind: 'personal' | 'team'; role: Role };
export type Folder = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  color: Color | null;
  position: string;
  sessionDate: string | null;
  term: string | null;
};
export type LinkrState = { user: { id: string; username: string }; spaces: Space[]; folders: Folder[] };
// Where things are saved: a folder, or a space's Inbox (folderId null).
export type Target = { spaceId: string; folderId: string | null };
export type Connection = { server: string; token: string; username: string };
export type SavedHit = { itemId: string; spaceId: string; folderId: string | null; title: string };

export class LinkrError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getConnection(): Promise<Connection | null> {
  const { connection } = await chrome.storage.local.get('connection');
  return (connection as Connection | undefined) ?? null;
}

export async function setConnection(connection: Connection | null) {
  if (connection) await chrome.storage.local.set({ connection });
  else await chrome.storage.local.remove(['connection', 'target']);
}

export async function getTarget(): Promise<Target | null> {
  const { target } = await chrome.storage.local.get('target');
  return (target as Target | undefined) ?? null;
}

export const setTarget = (target: Target) => chrome.storage.local.set({ target });

// "linkr.example.com" -> "https://linkr.example.com"; keeps http:// for local addresses.
export function normalizeServer(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) {
    const local = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/i.test(value);
    value = (local ? 'http://' : 'https://') + value;
  }
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return null;
  }
}

// The permission pattern for a server. Patterns can't name a port; they match every port.
export const originPattern = (server: string) => {
  const url = new URL(server);
  return `${url.protocol}//${url.hostname}/*`;
};

export const isSavable = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  connection?: Connection
) {
  const conn = connection ?? (await getConnection());
  if (!conn) throw new LinkrError(0, 'Connect the extension to your Linkr first.');
  let response: Response;
  try {
    response = await fetch(conn.server + '/api' + path, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${conn.token}`, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new LinkrError(0, `Can’t reach ${new URL(conn.server).host}. Is Linkr running?`);
  }
  const text = await response.text();
  let data: { message?: string } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // not JSON (a proxy's error page)
  }
  if (!response.ok) {
    // The token was revoked in Settings, or the account deleted: forget it.
    if (response.status === 401 && !connection) await setConnection(null);
    throw new LinkrError(response.status, data?.message ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export const linkr = {
  state: (connection?: Connection) => request<LinkrState>('/extension/state', {}, connection),
  lookup: (url: string) => request<{ saved: SavedHit[] }>(`/extension/lookup?url=${encodeURIComponent(url)}`),
  saveLink: (target: Target, url: string, title: string, notes: string) =>
    request<{ id: string }>('/items', {
      method: 'POST',
      body: { ...target, kind: 'link', url, ...(title.trim() ? { title: title.trim() } : {}), notes },
    }),
  saveNote: (target: Target, notes: string) =>
    request<{ id: string }>('/items', { method: 'POST', body: { ...target, kind: 'note', notes } }),
  saveTabs: (body: {
    spaceId: string;
    folderId?: string | null;
    newFolder?: { title: string; parentId: string | null; color: Color | null; sessionDate: string | null };
    tabs: { url: string; title: string }[];
  }) => request<{ folderId: string | null; saved: number }>('/extension/tabs', { method: 'POST', body }),
  folderTabs: (folderId: string) =>
    request<{ folder: { id: string; title: string; color: Color | null }; tabs: { url: string; title: string }[] }>(
      `/extension/folders/${folderId}/tabs`
    ),
};

// ---- Places in Linkr ----

export const itemUrl = (conn: Connection, spaceId: string, itemId: string) => `${conn.server}/s/${spaceId}/i/${itemId}`;
export const targetUrl = (conn: Connection, target: Target) =>
  `${conn.server}/s/${target.spaceId}${target.folderId ? `/f/${target.folderId}` : ''}`;

export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// "2026-11-03" -> "Tue 3 Nov" (with the year only when it isn't this year).
export function formatDate(date: string) {
  const value = new Date(date + 'T00:00:00');
  const thisYear = value.getFullYear() === new Date().getFullYear();
  return value.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

export const canSaveTo = (state: LinkrState, spaceId: string) =>
  state.spaces.some((space) => space.id === spaceId && space.role !== 'viewer');

// The last place used, if it still exists and can be saved to; otherwise the Personal Inbox.
export function resolveTarget(state: LinkrState, saved: Target | null): Target | null {
  if (saved && canSaveTo(state, saved.spaceId)) {
    if (!saved.folderId || state.folders.some((folder) => folder.id === saved.folderId)) return saved;
  }
  const space = state.spaces.find((s) => s.kind === 'personal') ?? state.spaces.find((s) => s.role !== 'viewer');
  return space ? { spaceId: space.id, folderId: null } : null;
}

export function targetName(state: LinkrState, target: Target) {
  if (!target.folderId) {
    const space = state.spaces.find((s) => s.id === target.spaceId);
    return space ? `${space.name} · Inbox` : 'Inbox';
  }
  return state.folders.find((folder) => folder.id === target.folderId)?.title ?? 'Folder';
}

// "Course / Week 3" for nested folders.
export function folderPath(state: LinkrState, folderId: string) {
  const byId = new Map(state.folders.map((folder) => [folder.id, folder]));
  const parts: string[] = [];
  let folder = byId.get(folderId);
  while (folder && parts.length < 8) {
    parts.unshift(folder.title);
    folder = folder.parentId ? byId.get(folder.parentId) : undefined;
  }
  return parts.join(' / ');
}

// ---- Tab group colours <-> Linkr colours ----

type GroupColor = `${chrome.tabGroups.Color}`;
const TO_GROUP: Record<Color, GroupColor> = {
  gray: 'grey',
  red: 'red',
  orange: 'orange',
  amber: 'yellow',
  green: 'green',
  teal: 'cyan',
  blue: 'blue',
  indigo: 'blue',
  purple: 'purple',
  pink: 'pink',
};
const FROM_GROUP: Record<string, Color> = {
  grey: 'gray',
  red: 'red',
  orange: 'orange',
  yellow: 'amber',
  green: 'green',
  cyan: 'teal',
  blue: 'blue',
  purple: 'purple',
  pink: 'pink',
};
export const groupColor = (color: Color | null): GroupColor => (color ? TO_GROUP[color] : 'orange');
export const linkrColor = (color: string | undefined): Color | null => (color ? (FROM_GROUP[color] ?? null) : null);

// Tab groups opened from (or saved to) a folder, so saving the group again adds to that folder.
export async function groupFolder(groupId: number): Promise<string | null> {
  const { groups } = await chrome.storage.session.get('groups');
  return (groups as Record<string, string> | undefined)?.[groupId] ?? null;
}
export async function linkGroup(groupId: number, folderId: string) {
  const { groups } = await chrome.storage.session.get('groups');
  await chrome.storage.session.set({ groups: { ...(groups as object | undefined), [groupId]: folderId } });
}
