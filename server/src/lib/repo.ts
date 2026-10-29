import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, nowIso } from '../db/client.ts';
import { items, itemsTags, tags } from '../db/schema.ts';
import { HttpError } from '../http.ts';

export type TagRow = typeof tags.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type NewItem = {
  type?: 'link' | 'note';
  url: string;
  title: string;
  description?: string;
  image?: string;
  comments?: string;
  body?: string | null;
  tagIds: number[];
  createdAt?: string;
};

// ---- Wire format (field names the faved front end already understands) ----

const tagToWire = (tag: TagRow) => ({
  id: tag.id,
  title: tag.title,
  description: tag.description,
  color: tag.color,
  parent: tag.parent,
  pinned: tag.pinned ? 1 : 0,
  created_at: tag.createdAt,
  updated_at: tag.updatedAt,
});

const itemToWire = (item: ItemRow, tagIds: number[]) => ({
  id: item.id,
  type: item.type,
  title: item.title,
  url: item.url,
  description: item.description,
  comments: item.comments,
  body: item.body,
  image: item.image,
  created_at: item.createdAt,
  updated_at: item.updatedAt,
  tags: tagIds,
});

// ---- Tags ----

export function getTagRows(userId: string): TagRow[] {
  return db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.title).all();
}

export function getTagsWire(userId: string) {
  return Object.fromEntries(getTagRows(userId).map((tag) => [tag.id, tagToWire(tag)]));
}

export function getOwnedTag(userId: string, tagId: number): TagRow {
  const tag = db
    .select()
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
    .get();
  if (!tag) throw new HttpError(404, `Tag with ID ${tagId} does not exist`);
  return tag;
}

export function createTag(userId: string, title: string, description = '', parent = 0): number {
  const row = db
    .insert(tags)
    .values({ userId, title, description, parent, color: 'gray', pinned: false, createdAt: nowIso() })
    .returning({ id: tags.id })
    .get();
  return row.id;
}

// "Work/Projects/Linkr" -> ["Work", "Projects", "Linkr"]; "\/" keeps a literal slash inside a name.
export function extractTagSegments(title: string): string[] {
  return title
    .replaceAll('\\/', '\u0000')
    .split('/')
    .map((segment) => segment.replaceAll('\u0000', '/').trim())
    .filter((segment) => segment !== '');
}

// Reuses existing tags along the path (case-insensitive) and creates the rest. Returns the leaf tag ID.
export function createTagsFromSegments(userId: string, segments: string[], description = ''): number {
  if (segments.length === 0) throw new HttpError(422, 'Tag title is required');
  const existing = getTagRows(userId);
  let parentId = 0;
  let reuse = true;
  for (const title of segments) {
    const match = reuse
      ? existing.find((tag) => tag.parent === parentId && tag.title.toLowerCase() === title.toLowerCase())
      : undefined;
    if (match) {
      parentId = match.id;
      continue;
    }
    parentId = createTag(userId, title, description, parentId);
    reuse = false;
  }
  return parentId;
}

// Item forms send existing tag IDs, plus "create:Some/Path" for tags typed in on the spot.
export function processInputTags(userId: string, input: (string | number)[]): number[] {
  const ownedIds = new Set(getTagRows(userId).map((tag) => tag.id));
  const result = new Set<number>();
  for (const value of input) {
    if (typeof value === 'string' && value.startsWith('create:')) {
      result.add(createTagsFromSegments(userId, extractTagSegments(value.slice('create:'.length))));
      continue;
    }
    const id = Number(value);
    if (!ownedIds.has(id)) throw new HttpError(422, 'Non-existing tags provided');
    result.add(id);
  }
  return [...result];
}

export function assertOwnedTagIds(userId: string, tagIds: number[]) {
  const ownedIds = new Set(getTagRows(userId).map((tag) => tag.id));
  if (tagIds.some((id) => !ownedIds.has(id))) throw new HttpError(422, 'Non-existing tags provided');
}

export function descendantTagIds(userId: string, tagId: number): number[] {
  const all = getTagRows(userId);
  const result = [tagId];
  for (let i = 0; i < result.length; i++) {
    for (const tag of all) if (tag.parent === result[i]) result.push(tag.id);
  }
  return result;
}

// ---- Items ----

export function getItemsWire(userId: string) {
  const rows = db.select().from(items).where(eq(items.userId, userId)).orderBy(desc(items.id)).all();
  const links = db
    .select({ itemId: itemsTags.itemId, tagId: itemsTags.tagId })
    .from(itemsTags)
    .innerJoin(items, eq(items.id, itemsTags.itemId))
    .where(eq(items.userId, userId))
    .orderBy(itemsTags.tagId)
    .all();
  const tagsByItem = new Map<number, number[]>();
  for (const link of links) {
    const list = tagsByItem.get(link.itemId) ?? [];
    list.push(link.tagId);
    tagsByItem.set(link.itemId, list);
  }
  return rows.map((row) => itemToWire(row, tagsByItem.get(row.id) ?? []));
}

// Keeps only the IDs that belong to this user; throws if none do.
export function ownedItemIds(userId: string, itemIds: number[]): number[] {
  if (itemIds.length === 0) return [];
  const owned = db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.userId, userId), inArray(items.id, itemIds)))
    .all()
    .map((row) => row.id);
  if (owned.length === 0) throw new HttpError(404, 'No items found with the provided IDs');
  return owned;
}

export function getOwnedItem(userId: string, itemId: number): ItemRow {
  const item = db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .get();
  if (!item) throw new HttpError(404, 'Item not found');
  return item;
}

export function createItems(userId: string, newItems: NewItem[]): number[] {
  return db.transaction((tx) => {
    const ids: number[] = [];
    for (const item of newItems) {
      const { id } = tx
        .insert(items)
        .values({
          userId,
          type: item.type ?? 'link',
          url: item.url,
          title: item.title,
          description: item.description ?? '',
          image: item.image ?? '',
          comments: item.comments ?? '',
          body: item.body ?? null,
          createdAt: item.createdAt ?? nowIso(),
        })
        .returning({ id: items.id })
        .get();
      if (item.tagIds.length > 0) {
        tx.insert(itemsTags)
          .values(item.tagIds.map((tagId) => ({ itemId: id, tagId })))
          .onConflictDoNothing()
          .run();
      }
      ids.push(id);
    }
    return ids;
  });
}

export function setItemTags(itemId: number, tagIds: number[]) {
  db.transaction((tx) => {
    tx.delete(itemsTags).where(eq(itemsTags.itemId, itemId)).run();
    if (tagIds.length > 0) {
      tx.insert(itemsTags)
        .values(tagIds.map((tagId) => ({ itemId, tagId })))
        .run();
    }
  });
}
