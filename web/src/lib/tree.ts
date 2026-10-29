import type { Folder, Item, SortMode } from './types';

type Folders = Record<string, Folder>;
type Items = Record<string, Item>;

const byPosition = (a: { position: string }, b: { position: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

// A folder counts as trashed or archived if it, or any folder above it, is.
export function folderStatus(folders: Folders, id: string): 'active' | 'archived' | 'trashed' {
  let status: 'active' | 'archived' | 'trashed' = 'active';
  for (
    let folder: Folder | undefined = folders[id];
    folder;
    folder = folder.parentId ? folders[folder.parentId] : undefined
  ) {
    if (folder.deletedAt) return 'trashed';
    if (folder.archivedAt) status = 'archived';
  }
  return status;
}

export function childFolders(folders: Folders, parentId: string | null): Folder[] {
  return Object.values(folders)
    .filter((folder) => folder.parentId === parentId && !folder.deletedAt && !folder.archivedAt)
    .sort(byPosition);
}

export function folderPath(folders: Folders, id: string | null): Folder[] {
  const path: Folder[] = [];
  for (
    let folder = id ? folders[id] : undefined;
    folder;
    folder = folder.parentId ? folders[folder.parentId] : undefined
  ) {
    path.unshift(folder);
  }
  return path;
}

export function isInside(folders: Folders, folderId: string, ancestorId: string): boolean {
  return folderPath(folders, folderId).some((folder) => folder.id === ancestorId);
}

export function itemsInFolder(items: Items, folderId: string | null, sort: SortMode): Item[] {
  const list = Object.values(items).filter((item) => item.folderId === folderId && !item.deletedAt);
  switch (sort) {
    case 'newest':
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'oldest':
      return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    default:
      return list.sort(byPosition);
  }
}

// Live (not trashed) item counts per folder; Inbox items are counted under ''.
export function itemCounts(items: Items): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of Object.values(items)) {
    if (item.deletedAt) continue;
    const key = item.folderId ?? '';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
