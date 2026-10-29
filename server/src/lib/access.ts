import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { folders, items, spaceMembers, tags } from '../db/schema.ts';
import { HttpError } from '../http.ts';

export type Role = 'owner' | 'editor' | 'viewer';
const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

// Every request touching space data goes through here: no membership, no access.
export function requireRole(userId: string, spaceId: string, minimum: Role): Role {
  const member = db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .get();
  // Not found and not allowed look the same, so IDs can't be probed.
  if (!member) throw new HttpError(404, 'Space not found');
  if (RANK[member.role] < RANK[minimum]) throw new HttpError(403, 'You can only view this space');
  return member.role;
}

export function memberIds(spaceId: string): string[] {
  return db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, spaceId))
    .all()
    .map((row) => row.userId);
}

export function loadFolder(userId: string, folderId: string, minimum: Role) {
  const folder = db.select().from(folders).where(eq(folders.id, folderId)).get();
  if (!folder) throw new HttpError(404, 'Folder not found');
  requireRole(userId, folder.spaceId, minimum);
  return folder;
}

export function loadItem(userId: string, itemId: string, minimum: Role) {
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item) throw new HttpError(404, 'Item not found');
  requireRole(userId, item.spaceId, minimum);
  return item;
}

export function loadTag(userId: string, tagId: string, minimum: Role) {
  const tag = db.select().from(tags).where(eq(tags.id, tagId)).get();
  if (!tag) throw new HttpError(404, 'Tag not found');
  requireRole(userId, tag.spaceId, minimum);
  return tag;
}

// A folder used as a destination must live in the same space (null means the Inbox / top level).
export function assertFolderInSpace(folderId: string | null, spaceId: string) {
  if (folderId === null) return;
  const folder = db.select({ spaceId: folders.spaceId }).from(folders).where(eq(folders.id, folderId)).get();
  if (!folder || folder.spaceId !== spaceId) throw new HttpError(422, 'Folder not found in this space');
}

export function assertTagsInSpace(tagIds: string[], spaceId: string) {
  if (tagIds.length === 0) return;
  const found = new Set(
    db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.spaceId, spaceId))
      .all()
      .map((row) => row.id)
  );
  if (tagIds.some((id) => !found.has(id))) throw new HttpError(422, 'Tag not found in this space');
}
