import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { db, nowIso } from '../db/client.ts';
import { itemContent, items, itemTags } from '../db/schema.ts';
import { mutate } from '../events.ts';
import { HttpError, parseInput, type AppEnv } from '../http.ts';
import { assertFolderInSpace, assertTagsInSpace, loadItem, requireRole } from '../lib/access.ts';
import { getItemWire } from '../lib/data.ts';
import { documentSchema, idSchema, newId } from '../lib/ids.ts';
import { clearItemStorage } from '../lib/files.ts';
import {
  clearItemImages,
  fetchRemoteImage,
  readCachedImage,
  UPLOAD_THUMBNAIL,
  writeCachedImage,
  type ImageFile,
} from '../lib/images.ts';
import { enqueueFetch, fetchReaderCopy, placeholderTitle } from '../lib/link-queue.ts';
import { isVideoUrl } from '../lib/metadata.ts';
import { isValidPosition, itemPositionsAtTop } from '../lib/positions.ts';
import { colorSchema } from './spaces.ts';

export const httpUrl = z
  .string()
  .trim()
  .max(4000)
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'Enter a valid http or https URL');

const itemFields = {
  title: z.string().trim().min(1, 'Title is required').max(1000),
  url: z.union([httpUrl, z.literal('')]),
  description: z.string().max(10_000),
  notes: z.string().max(200_000),
  body: documentSchema.nullable(),
  image: z.union([httpUrl, z.literal('')]),
  color: colorSchema.nullable(),
  pinned: z.boolean(),
  folderId: idSchema.nullable(),
  position: z.string().max(200),
  tagIds: z.array(idSchema).max(200),
};

const idList = z.object({ ids: z.array(idSchema).min(1, 'Select at least one item').max(5000) });

// A note's title is its first line, unless one is given.
const noteTitle = (notes: string) => notes.trim().split('\n')[0].slice(0, 120) || 'Untitled note';

// All rows must exist and share one space the user can edit.
function loadItemsForEdit(userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = db.select().from(items).where(inArray(items.id, unique)).all();
  if (rows.length !== unique.length) throw new HttpError(404, 'Item not found');
  const spaceId = rows[0].spaceId;
  if (rows.some((row) => row.spaceId !== spaceId)) throw new HttpError(422, 'Items must be in the same space');
  requireRole(userId, spaceId, 'editor');
  return { rows, spaceId, ids: unique };
}

// Sends an item's preview image from the cache, fetching it once (SSRF-guarded) if needed.
// Used by members and public pages.
export async function itemImageResponse(c: Context, item: typeof items.$inferSelect): Promise<Response> {
  const respond = (image: ImageFile | null, maxAgeSeconds: number) => {
    c.header('cache-control', maxAgeSeconds > 0 ? `private, max-age=${maxAgeSeconds}` : 'no-store');
    c.header('x-content-type-options', 'nosniff');
    // SVGs can carry scripts; never let one run on this origin.
    c.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    if (!image) return c.body(null, 404);
    c.header('content-type', image.mime);
    return c.body(new Uint8Array(image.contents));
  };
  if (!item.image) return respond(null, 0);
  const cached = readCachedImage(item.id, item.image);
  if (cached) return respond(cached, 7 * 24 * 60 * 60);
  if (item.image === UPLOAD_THUMBNAIL) return respond(null, 0);
  try {
    const image = await fetchRemoteImage(item.image);
    writeCachedImage(item.id, item.image, image);
    return respond(image, 7 * 24 * 60 * 60);
  } catch {
    return respond(null, 60 * 60);
  }
}

export const itemRoutes = new Hono<AppEnv>()
  .post('/items', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(
      z.object({
        id: idSchema.optional(),
        spaceId: idSchema,
        kind: z.enum(['link', 'note']).default('link'),
        url: itemFields.url.default(''),
        title: itemFields.title.optional(),
        description: itemFields.description.default(''),
        notes: itemFields.notes.default(''),
        folderId: itemFields.folderId.default(null),
        position: itemFields.position.optional(),
        tagIds: itemFields.tagIds.default([]),
      }),
      await c.req.json()
    );
    if (input.kind === 'link' && !input.url) throw new HttpError(422, 'URL is required');
    requireRole(userId, input.spaceId, 'editor');
    assertFolderInSpace(input.folderId, input.spaceId);
    assertTagsInSpace(input.tagIds, input.spaceId);
    if (input.id && db.select({ id: items.id }).from(items).where(eq(items.id, input.id)).get()) {
      throw new HttpError(409, 'An item with this ID already exists');
    }

    const id = input.id ?? newId();
    const isLink = input.kind === 'link';
    const now = nowIso();
    mutate(input.spaceId, userId, (tx, touch) => {
      const position =
        input.position && isValidPosition(input.position)
          ? input.position
          : itemPositionsAtTop(tx, input.spaceId, input.folderId, 1)[0];
      tx.insert(items)
        .values({
          id,
          spaceId: input.spaceId,
          folderId: input.folderId,
          kind: isLink && isVideoUrl(input.url) ? 'video' : input.kind,
          url: input.url,
          title: input.title ?? (isLink ? placeholderTitle(input.url) : noteTitle(input.notes)),
          description: input.description,
          notes: input.notes,
          position,
          fetchStatus: isLink ? 'pending' : 'done',
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      if (input.tagIds.length) {
        tx.insert(itemTags)
          .values([...new Set(input.tagIds)].map((tagId) => ({ itemId: id, tagId })))
          .run();
      }
      touch({ entity: 'item', id });
    });
    if (isLink) enqueueFetch(id);
    return c.json(getItemWire(id), 201);
  })
  .patch('/items/:id', async (c) => {
    const userId = c.var.user.id;
    const item = loadItem(userId, c.req.param('id'), 'editor');
    const input = parseInput(z.object(itemFields).partial(), await c.req.json());
    if (input.folderId !== undefined) assertFolderInSpace(input.folderId, item.spaceId);
    if (input.tagIds) assertTagsInSpace(input.tagIds, item.spaceId);
    if (input.position !== undefined && !isValidPosition(input.position)) throw new HttpError(422, 'Invalid position');
    if (item.fileId && input.url) throw new HttpError(422, 'Uploaded files can’t be given a link');

    const { tagIds, ...fields } = input;
    const urlChanged = fields.url !== undefined && fields.url !== item.url;
    mutate(item.spaceId, userId, (tx, touch) => {
      tx.update(items)
        .set({
          ...fields,
          ...(urlChanged ? { frameable: null, ...(fields.url ? { fetchStatus: 'pending' as const } : {}) } : {}),
          updatedAt: nowIso(),
        })
        .where(eq(items.id, item.id))
        .run();
      if (urlChanged) tx.delete(itemContent).where(eq(itemContent.itemId, item.id)).run();
      if (tagIds) {
        tx.delete(itemTags).where(eq(itemTags.itemId, item.id)).run();
        if (tagIds.length) {
          tx.insert(itemTags)
            .values([...new Set(tagIds)].map((tagId) => ({ itemId: item.id, tagId })))
            .run();
        }
      }
      touch({ entity: 'item', id: item.id });
    });
    if (urlChanged || (fields.image !== undefined && fields.image !== item.image)) clearItemImages([item.id]);
    if (urlChanged && fields.url) enqueueFetch(item.id);
    return c.json(getItemWire(item.id));
  })
  // Moves several items into a folder (null = Inbox), placing them at the top in the given order.
  .post('/items/move', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(idList.extend({ folderId: idSchema.nullable() }), await c.req.json());
    const { spaceId, ids } = loadItemsForEdit(userId, input.ids);
    assertFolderInSpace(input.folderId, spaceId);
    mutate(spaceId, userId, (tx, touch) => {
      const positions = itemPositionsAtTop(tx, spaceId, input.folderId, ids.length);
      const now = nowIso();
      ids.forEach((id, index) => {
        tx.update(items)
          .set({ folderId: input.folderId, position: positions[index], updatedAt: now })
          .where(eq(items.id, id))
          .run();
        touch({ entity: 'item', id });
      });
    });
    return c.body(null, 204);
  })
  .post('/items/trash', async (c) => {
    const { spaceId, ids } = loadItemsForEdit(c.var.user.id, parseInput(idList, await c.req.json()).ids);
    mutate(spaceId, c.var.user.id, (tx, touch) => {
      tx.update(items).set({ deletedAt: nowIso(), updatedAt: nowIso() }).where(inArray(items.id, ids)).run();
      ids.forEach((id) => touch({ entity: 'item', id }));
    });
    return c.body(null, 204);
  })
  .post('/items/restore', async (c) => {
    const { spaceId, ids } = loadItemsForEdit(c.var.user.id, parseInput(idList, await c.req.json()).ids);
    mutate(spaceId, c.var.user.id, (tx, touch) => {
      tx.update(items).set({ deletedAt: null, updatedAt: nowIso() }).where(inArray(items.id, ids)).run();
      ids.forEach((id) => touch({ entity: 'item', id }));
    });
    return c.body(null, 204);
  })
  // Deleting for good only applies to items already in the Trash.
  .post('/items/purge', async (c) => {
    const { spaceId, ids } = loadItemsForEdit(c.var.user.id, parseInput(idList, await c.req.json()).ids);
    const purged = mutate(spaceId, c.var.user.id, (tx, touch) => {
      const deleted = tx
        .delete(items)
        .where(and(inArray(items.id, ids), isNotNull(items.deletedAt)))
        .returning({ id: items.id })
        .all()
        .map((row) => row.id);
      deleted.forEach((id) => touch({ entity: 'item', id, op: 'delete' }));
      return deleted;
    });
    clearItemStorage(purged);
    return c.body(null, 204);
  })
  .post('/items/:id/refetch', (c) => {
    const item = loadItem(c.var.user.id, c.req.param('id'), 'editor');
    if (!item.url) throw new HttpError(422, 'Only links can be refetched');
    mutate(item.spaceId, c.var.user.id, (tx, touch) => {
      tx.update(items).set({ fetchStatus: 'pending', updatedAt: nowIso() }).where(eq(items.id, item.id)).run();
      touch({ entity: 'item', id: item.id });
    });
    enqueueFetch(item.id, true);
    return c.body(null, 202);
  })
  // The saved reader copy of a link. Links saved before reader copies existed get one on first request.
  .get('/items/:id/content', async (c) => {
    const item = loadItem(c.var.user.id, c.req.param('id'), 'viewer');
    const read = () => db.select().from(itemContent).where(eq(itemContent.itemId, item.id)).get();
    let content = read();
    if (!content && item.url && item.kind === 'link' && item.frameable === null) {
      await fetchReaderCopy(item.id).catch(() => {});
      content = read();
    }
    if (!content) throw new HttpError(404, 'There is no reader copy of this page');
    return c.json({ html: content.html, byline: content.byline, words: content.words, fetchedAt: content.fetchedAt });
  })
  // Preview image, fetched by the server (SSRF-guarded) and cached on disk per item.
  .get('/items/:id/image', (c) => itemImageResponse(c, loadItem(c.var.user.id, c.req.param('id'), 'viewer')));
