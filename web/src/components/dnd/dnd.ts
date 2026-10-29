import { create } from 'zustand';

// What is being dragged, and what it can be dropped on.
export type DragData = { type: 'item'; itemId: string } | { type: 'folder'; folderId: string };
export type DropData =
  // `tile`: a folder card on a page, where dropping always means "inside".
  | { type: 'folder'; folderId: string; tile?: boolean }
  | { type: 'inbox' }
  | { type: 'folder-root' }
  | { type: 'item'; itemId: string };

export type FolderZone = 'before' | 'inside' | 'after';

// Live drop feedback, read by sidebar rows to draw the insertion line or highlight.
export const useDragState = create<{
  dragging: DragData | null;
  folderDrop: { folderId: string; zone: FolderZone } | null;
}>(() => ({
  dragging: null,
  folderDrop: null,
}));
