import { generateNKeysBetween } from 'fractional-indexing';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { newId } from '@/lib/ids';
import { makeThumbnail } from '@/lib/thumbnail';
import { itemsInFolder } from '@/lib/tree';
import type { Item, ItemKind } from '@/lib/types';
import { save, useStore } from '@/store/store';

// Per device: how far each upload has got (0–1), and a local preview to show until the thumbnail arrives.
export const useUploads = create<{ progress: Record<string, number>; previews: Record<string, string> }>(() => ({
  progress: {},
  previews: {},
}));

const PARALLEL_UPLOADS = 3;

// Settles when an upload started by uploadFiles finishes (with the saved item, or undefined if it failed).
const finished = new Map<string, Promise<Item | undefined>>();
export const whenUploaded = (id: string) => finished.get(id) ?? Promise.resolve(undefined);

const kindFor = (mime: string): ItemKind =>
  mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('video/')
      ? 'video'
      : mime === 'application/pdf'
        ? 'pdf'
        : 'file';

function setProgress(id: string, fraction: number | null) {
  useUploads.setState((state) => {
    const progress = { ...state.progress };
    if (fraction === null) delete progress[id];
    else progress[id] = fraction;
    return { progress };
  });
}

function dropPreview(id: string) {
  const url = useUploads.getState().previews[id];
  if (!url) return;
  URL.revokeObjectURL(url);
  useUploads.setState((state) => {
    const previews = { ...state.previews };
    delete previews[id];
    return { previews };
  });
}

async function uploadOne(file: File, item: Item): Promise<Item | undefined> {
  const params = new URLSearchParams({ spaceId: item.spaceId, id: item.id, name: file.name, position: item.position });
  if (item.folderId) params.set('folderId', item.folderId);
  const saved = await save(
    [item.id],
    () => api.upload<Item>(`/items/upload?${params}`, file, (fraction) => setProgress(item.id, fraction)),
    () => {
      dropPreview(item.id);
      useStore.setState((state) => {
        const items = { ...state.items };
        delete items[item.id];
        return { items };
      });
    }
  );
  setProgress(item.id, null);
  if (!saved) return undefined;
  useStore.setState((state) => ({ items: { ...state.items, [saved.id]: saved } }));
  void addThumbnail(file, item.id);
  return saved;
}

async function addThumbnail(file: File, itemId: string) {
  const thumbnail = await makeThumbnail(file);
  const stored =
    thumbnail && (await save([itemId], () => api.put(`/items/${itemId}/thumbnail`, thumbnail).then(() => true)));
  if (stored) dropPreview(itemId);
}

// Each file becomes an item at the top of the folder (null = Inbox), in the order given.
// Cards appear at once with a progress bar; returns the new items' IDs.
export function uploadFiles(files: File[], folderId: string | null): string[] {
  const { spaceId, items, appInfo } = useStore.getState();
  if (!spaceId || files.length === 0) return [];

  const maxMb = appInfo?.maxUploadMb ?? 100;
  const tooBig = files.filter((file) => file.size > maxMb * 1024 * 1024);
  // Folders dragged from the desktop arrive as empty, unreadable files.
  const empty = files.filter((file) => file.size === 0);
  if (tooBig.length) {
    toast.error(
      tooBig.length === 1
        ? `“${tooBig[0].name}” is larger than ${maxMb} MB`
        : `${tooBig.length} files are larger than ${maxMb} MB`
    );
  }
  if (empty.length)
    toast.error(
      empty.length === 1 ? `“${empty[0].name}” is empty or a folder` : `${empty.length} files are empty or folders`
    );
  const accepted = files.filter((file) => file.size > 0 && file.size <= maxMb * 1024 * 1024);
  if (accepted.length === 0) return [];

  const first = itemsInFolder(items, folderId, 'manual')[0];
  const positions = generateNKeysBetween(null, first?.position ?? null, accepted.length);
  const now = new Date().toISOString();
  const queue = accepted.map((file, index) => {
    const kind = kindFor(file.type);
    const item: Item = {
      id: newId(),
      spaceId,
      folderId,
      kind,
      title: file.name.replace(/\.[^.\s]{1,8}$/, '').trim() || file.name,
      url: '',
      description: '',
      notes: '',
      body: null,
      image: '',
      favicon: '',
      siteName: '',
      color: null,
      pinned: false,
      position: positions[index],
      fetchStatus: 'done',
      frameable: null,
      file: { id: '', name: file.name, mime: file.type, size: file.size },
      tagIds: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    return { file, item };
  });

  useStore.setState((state) => ({
    items: { ...state.items, ...Object.fromEntries(queue.map(({ item }) => [item.id, item])) },
  }));
  useUploads.setState((state) => ({
    progress: { ...state.progress, ...Object.fromEntries(queue.map(({ item }) => [item.id, 0])) },
    previews: {
      ...state.previews,
      ...Object.fromEntries(
        queue.filter(({ item }) => item.kind === 'image').map(({ file, item }) => [item.id, URL.createObjectURL(file)])
      ),
    },
  }));

  const pending = queue.map((entry) => {
    let settle: (item: Item | undefined) => void = () => {};
    finished.set(
      entry.item.id,
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    return { ...entry, settle };
  });
  const worker = async () => {
    for (let next = pending.shift(); next; next = pending.shift()) {
      const saved = await uploadOne(next.file, next.item);
      next.settle(saved);
      finished.delete(next.item.id);
    }
  };
  for (let i = 0; i < Math.min(PARALLEL_UPLOADS, pending.length); i++) void worker();
  return queue.map(({ item }) => item.id);
}

// Opens the device's file picker.
export function pickFiles(folderId: string | null) {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = () => {
    if (input.files?.length) uploadFiles([...input.files], folderId);
  };
  input.click();
}
