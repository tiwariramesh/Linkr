import { and, desc, eq, gt, inArray, max } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { changes, files, folders, highlights, items, itemTags, spaceMembers, spaces, tags } from '../db/schema.ts';

type ItemRow = typeof items.$inferSelect;
type FolderRow = typeof folders.$inferSelect;
type TagRow = typeof tags.$inferSelect;
type SpaceRow = typeof spaces.$inferSelect;
type FileRow = typeof files.$inferSelect;
type HighlightRow = typeof highlights.$inferSelect;

// ---- Wire format (what the web app receives) ----

export const spaceWire = (space: SpaceRow, role: string) => ({
  id: space.id,
  name: space.name,
  icon: space.icon,
  color: space.color,
  kind: space.kind,
  role,
  createdAt: space.createdAt,
  updatedAt: space.updatedAt,
});

export const folderWire = (folder: FolderRow) => ({
  id: folder.id,
  spaceId: folder.spaceId,
  parentId: folder.parentId,
  title: folder.title,
  description: folder.description,
  cover: folder.cover,
  icon: folder.icon,
  color: folder.color,
  position: folder.position,
  sessionDate: folder.sessionDate,
  term: folder.term,
  view: folder.view ?? {},
  body: folder.body,
  notes: folder.notes,
  pinned: folder.pinned,
  archivedAt: folder.archivedAt,
  deletedAt: folder.deletedAt,
  copiedFrom: folder.copiedFrom,
  createdAt: folder.createdAt,
  updatedAt: folder.updatedAt,
});

export const itemWire = (item: ItemRow, tagIds: string[], file: FileRow | undefined) => ({
  id: item.id,
  spaceId: item.spaceId,
  folderId: item.folderId,
  kind: item.kind,
  title: item.title,
  url: item.url,
  description: item.description,
  notes: item.notes,
  body: item.body,
  image: item.image,
  favicon: item.favicon,
  siteName: item.siteName,
  color: item.color,
  pinned: item.pinned,
  position: item.position,
  fetchStatus: item.fetchStatus,
  frameable: item.frameable,
  file: file ? { id: file.id, name: file.name, mime: file.mime, size: file.size } : null,
  tagIds,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  deletedAt: item.deletedAt,
});

export const tagWire = (tag: TagRow) => ({
  id: tag.id,
  spaceId: tag.spaceId,
  parentId: tag.parentId,
  title: tag.title,
  color: tag.color,
});

export const highlightWire = (highlight: HighlightRow) => ({
  id: highlight.id,
  spaceId: highlight.spaceId,
  itemId: highlight.itemId,
  quote: highlight.quote,
  prefix: highlight.prefix,
  suffix: highlight.suffix,
  start: highlight.start,
  color: highlight.color,
  comment: highlight.comment,
  createdBy: highlight.createdBy,
  createdAt: highlight.createdAt,
  updatedAt: highlight.updatedAt,
});

function tagIdsFor(itemIds: string[]) {
  const map = new Map<string, string[]>();
  if (itemIds.length === 0) return map;
  // SQLite caps bound parameters; chunk large requests.
  for (let i = 0; i < itemIds.length; i += 500) {
    const rows = db
      .select()
      .from(itemTags)
      .where(inArray(itemTags.itemId, itemIds.slice(i, i + 500)))
      .all();
    for (const row of rows) map.set(row.itemId, [...(map.get(row.itemId) ?? []), row.tagId]);
  }
  return map;
}

function filesFor(fileIds: string[]) {
  const map = new Map<string, FileRow>();
  for (let i = 0; i < fileIds.length; i += 500) {
    const rows = db
      .select()
      .from(files)
      .where(inArray(files.id, fileIds.slice(i, i + 500)))
      .all();
    for (const row of rows) map.set(row.id, row);
  }
  return map;
}

export function itemsWire(rows: ItemRow[]) {
  const tagMap = tagIdsFor(rows.map((row) => row.id));
  const fileMap = filesFor(rows.flatMap((row) => (row.fileId ? [row.fileId] : [])));
  return rows.map((row) => itemWire(row, tagMap.get(row.id) ?? [], row.fileId ? fileMap.get(row.fileId) : undefined));
}

export function getItemWire(itemId: string) {
  const row = db.select().from(items).where(eq(items.id, itemId)).get();
  return row ? itemsWire([row])[0] : null;
}

// ---- Spaces for a user ----

export function userSpaces(userId: string) {
  return db
    .select({ space: spaces, role: spaceMembers.role })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(eq(spaceMembers.userId, userId))
    .orderBy(spaces.createdAt)
    .all()
    .map(({ space, role }) => spaceWire(space, role));
}

export function currentSeq(spaceId: string): number {
  return (
    db
      .select({ seq: max(changes.seq) })
      .from(changes)
      .where(eq(changes.spaceId, spaceId))
      .get()?.seq ?? 0
  );
}

// ---- Sync ----

// Everything a device needs to show a space, including trashed rows (for the Trash view).
export function spaceSnapshot(spaceId: string) {
  const seq = currentSeq(spaceId);
  return {
    seq,
    folders: db.select().from(folders).where(eq(folders.spaceId, spaceId)).all().map(folderWire),
    items: itemsWire(db.select().from(items).where(eq(items.spaceId, spaceId)).orderBy(desc(items.createdAt)).all()),
    tags: db.select().from(tags).where(eq(tags.spaceId, spaceId)).all().map(tagWire),
    highlights: db.select().from(highlights).where(eq(highlights.spaceId, spaceId)).all().map(highlightWire),
  };
}

// Current state of every row that changed after `since`. Rows that no longer exist are reported as deleted.
export function changesSince(spaceId: string, since: number) {
  const touched = db
    .selectDistinct({ entity: changes.entity, id: changes.entityId })
    .from(changes)
    .where(and(eq(changes.spaceId, spaceId), gt(changes.seq, since)))
    .all();
  const ids = {
    space: [] as string[],
    folder: [] as string[],
    item: [] as string[],
    tag: [] as string[],
    highlight: [] as string[],
  };
  for (const row of touched) ids[row.entity].push(row.id);

  const found = {
    folders: ids.folder.length ? db.select().from(folders).where(inArray(folders.id, ids.folder)).all() : [],
    items: ids.item.length ? db.select().from(items).where(inArray(items.id, ids.item)).all() : [],
    tags: ids.tag.length ? db.select().from(tags).where(inArray(tags.id, ids.tag)).all() : [],
    highlights: ids.highlight.length
      ? db.select().from(highlights).where(inArray(highlights.id, ids.highlight)).all()
      : [],
  };
  const missing = (requested: string[], rows: { id: string }[]) => {
    const present = new Set(rows.map((row) => row.id));
    return requested.filter((id) => !present.has(id));
  };
  const space = ids.space.length ? db.select().from(spaces).where(eq(spaces.id, spaceId)).get() : undefined;

  return {
    seq: currentSeq(spaceId),
    space: space ? { id: space.id, name: space.name, icon: space.icon, color: space.color } : null,
    folders: found.folders.map(folderWire),
    items: itemsWire(found.items),
    tags: found.tags.map(tagWire),
    highlights: found.highlights.map(highlightWire),
    deleted: {
      folders: missing(ids.folder, found.folders),
      items: missing(ids.item, found.items),
      tags: missing(ids.tag, found.tags),
      highlights: missing(ids.highlight, found.highlights),
    },
  };
}
