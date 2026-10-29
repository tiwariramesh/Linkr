// Mirrors the server's JSON (server/src/lib/data.ts).

export type ColorName = 'gray' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'indigo' | 'purple' | 'pink';

export type User = { id: string; username: string; email: string };

export type Space = {
  id: string;
  name: string;
  icon: string | null;
  color: ColorName;
  kind: 'personal' | 'team';
  role: 'owner' | 'editor' | 'viewer';
};

export type FolderView = { layout?: 'cards' | 'list'; sort?: SortMode };
export type SortMode = 'manual' | 'newest' | 'oldest' | 'title';

export type Folder = {
  id: string;
  spaceId: string;
  parentId: string | null;
  title: string;
  icon: string | null;
  color: ColorName | null;
  position: string;
  sessionDate: string | null;
  term: string | null;
  view: FolderView;
  // Session notes: editor JSON (null until first edited) and its plain text.
  body: string | null;
  notes: string;
  pinned: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  // The folder this one was copied from with "Run again".
  copiedFrom: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemKind = 'link' | 'note' | 'file' | 'image' | 'video' | 'pdf';

// An uploaded file behind a file, image, video or PDF item.
export type FileInfo = { id: string; name: string; mime: string; size: number };

export type Item = {
  id: string;
  spaceId: string;
  folderId: string | null;
  kind: ItemKind;
  title: string;
  url: string;
  description: string;
  notes: string;
  // Rich notes as editor JSON; null until edited in the notes editor (then `notes` is its plain text).
  body: string | null;
  image: string;
  favicon: string;
  siteName: string;
  color: ColorName | null;
  pinned: boolean;
  position: string;
  fetchStatus: 'pending' | 'done' | 'failed';
  // Whether the page may be shown in a frame; null = not known yet.
  frameable: boolean | null;
  file: FileInfo | null;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type Tag = { id: string; spaceId: string; parentId: string | null; title: string; color: ColorName | null };

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

// A passage marked in an item's reader copy. It is found again by its text: `quote` with a little
// `prefix` and `suffix` context, and `start` (its offset in the article text) to choose between repeats.
export type Highlight = {
  id: string;
  spaceId: string;
  itemId: string;
  quote: string;
  prefix: string;
  suffix: string;
  start: number;
  color: HighlightColor;
  comment: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Snapshot = { seq: number; folders: Folder[]; items: Item[]; tags: Tag[]; highlights: Highlight[] };

export type ChangeSet = {
  seq: number;
  space: Pick<Space, 'id' | 'name' | 'icon' | 'color'> | null;
  folders: Folder[];
  items: Item[];
  tags: Tag[];
  highlights: Highlight[];
  deleted: { folders: string[]; items: string[]; tags: string[]; highlights: string[] };
};

// A full-text match. The snippet marks matched words with  … .
export type SearchHit = {
  type: 'item' | 'folder';
  id: string;
  field: 'title' | 'notes' | 'page' | 'highlight' | 'session';
  snippet: string;
};

export type AppInfo = {
  version: string;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  registrationOpen: boolean;
  maxUploadMb: number;
};
