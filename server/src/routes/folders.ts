import { eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, nowIso } from '../db/client.ts';
import { folders, items } from '../db/schema.ts';
import { mutate } from '../events.ts';
import { HttpError, parseInput, type AppEnv } from '../http.ts';
import { assertFolderInSpace, loadFolder, requireRole } from '../lib/access.ts';
import { folderWire } from '../lib/data.ts';
import { documentSchema, idSchema, newId } from '../lib/ids.ts';
import { clearItemStorage } from '../lib/files.ts';
import { folderPositionAtEnd, isValidPosition } from '../lib/positions.ts';
import { colorSchema } from './spaces.ts';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const viewSchema = z.object({
  layout: z.enum(['cards', 'list']).optional(),
  sort: z.enum(['manual', 'newest', 'oldest', 'title']).optional(),
});

const folderFields = {
  title: z.string().trim().min(1, 'Title is required').max(200),
  icon: z.string().max(16).nullable(),
  color: colorSchema.nullable(),
  parentId: idSchema.nullable(),
  position: z.string().max(200),
  sessionDate: dateSchema.nullable(),
  term: z.string().trim().max(80).nullable(),
  view: viewSchema,
  body: documentSchema.nullable(),
  notes: z.string().max(200_000),
  pinned: z.boolean(),
  archived: z.boolean(),
};

// All folders below `folderId` (and itself), from one query per level.
export function subtreeIds(folderId: string): string[] {
  const result = [folderId];
  for (let i = 0; i < result.length; i++) {
    const children = db.select({ id: folders.id }).from(folders).where(eq(folders.parentId, result[i])).all();
    result.push(...children.map((child) => child.id));
  }
  return result;
}

export const folderRoutes = new Hono<AppEnv>()
  .post('/folders', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(
      z.object({
        id: idSchema.optional(),
        spaceId: idSchema,
        title: folderFields.title,
        parentId: folderFields.parentId.optional(),
        icon: folderFields.icon.optional(),
        color: folderFields.color.optional(),
        position: folderFields.position.optional(),
        sessionDate: folderFields.sessionDate.optional(),
        term: folderFields.term.optional(),
      }),
      await c.req.json()
    );
    requireRole(userId, input.spaceId, 'editor');
    const parentId = input.parentId ?? null;
    assertFolderInSpace(parentId, input.spaceId);
    const id = input.id ?? newId();
    const now = nowIso();
    mutate(input.spaceId, userId, (tx, touch) => {
      const position =
        input.position && isValidPosition(input.position)
          ? input.position
          : folderPositionAtEnd(tx, input.spaceId, parentId);
      tx.insert(folders)
        .values({
          id,
          spaceId: input.spaceId,
          parentId,
          title: input.title,
          icon: input.icon ?? null,
          color: input.color ?? null,
          position,
          sessionDate: input.sessionDate ?? null,
          term: input.term ?? null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      touch({ entity: 'folder', id });
    });
    return c.json(folderWire(db.select().from(folders).where(eq(folders.id, id)).get()!), 201);
  })
  .patch('/folders/:id', async (c) => {
    const userId = c.var.user.id;
    const folder = loadFolder(userId, c.req.param('id'), 'editor');
    const input = parseInput(z.object(folderFields).partial(), await c.req.json());
    if (input.parentId !== undefined && input.parentId !== folder.parentId) {
      assertFolderInSpace(input.parentId, folder.spaceId);
      if (input.parentId && subtreeIds(folder.id).includes(input.parentId)) {
        throw new HttpError(422, 'A folder cannot be moved inside itself');
      }
    }
    if (input.position !== undefined && !isValidPosition(input.position)) {
      throw new HttpError(422, 'Invalid position');
    }
    const { archived, view, ...fields } = input;
    mutate(folder.spaceId, userId, (tx, touch) => {
      tx.update(folders)
        .set({
          ...fields,
          ...(view ? { view: { ...(folder.view ?? {}), ...view } } : {}),
          ...(archived !== undefined ? { archivedAt: archived ? nowIso() : null } : {}),
          updatedAt: nowIso(),
        })
        .where(eq(folders.id, folder.id))
        .run();
      touch({ entity: 'folder', id: folder.id });
    });
    return c.json(folderWire(db.select().from(folders).where(eq(folders.id, folder.id)).get()!));
  })
  // Trash: the folder hides its whole subtree until restored or purged.
  .post('/folders/:id/trash', (c) => {
    const folder = loadFolder(c.var.user.id, c.req.param('id'), 'editor');
    mutate(folder.spaceId, c.var.user.id, (tx, touch) => {
      tx.update(folders).set({ deletedAt: nowIso(), updatedAt: nowIso() }).where(eq(folders.id, folder.id)).run();
      touch({ entity: 'folder', id: folder.id });
    });
    return c.body(null, 204);
  })
  .post('/folders/:id/restore', (c) => {
    const folder = loadFolder(c.var.user.id, c.req.param('id'), 'editor');
    mutate(folder.spaceId, c.var.user.id, (tx, touch) => {
      tx.update(folders).set({ deletedAt: null, updatedAt: nowIso() }).where(eq(folders.id, folder.id)).run();
      touch({ entity: 'folder', id: folder.id });
    });
    return c.body(null, 204);
  })
  .delete('/folders/:id', (c) => {
    const folder = loadFolder(c.var.user.id, c.req.param('id'), 'editor');
    purgeFolders(folder.spaceId, c.var.user.id, [folder.id]);
    return c.body(null, 204);
  });

// Deletes folders for good, with everything inside them (rows cascade; cached images are files).
export function purgeFolders(spaceId: string, actorId: string | null, folderIds: string[]) {
  const allFolderIds = [...new Set(folderIds.flatMap(subtreeIds))];
  const itemIds = allFolderIds.length
    ? db
        .select({ id: items.id })
        .from(items)
        .where(inArray(items.folderId, allFolderIds))
        .all()
        .map((row) => row.id)
    : [];
  mutate(spaceId, actorId, (tx, touch) => {
    tx.delete(folders).where(inArray(folders.id, folderIds)).run();
    for (const id of allFolderIds) touch({ entity: 'folder', id, op: 'delete' });
    for (const id of itemIds) touch({ entity: 'item', id, op: 'delete' });
  });
  clearItemStorage(itemIds);
}
