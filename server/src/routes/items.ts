import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, nowIso } from '../db/client.ts';
import { items, itemsTags } from '../db/schema.ts';
import { clientIdOf, publish } from '../events.ts';
import { HttpError, parseInput, success, type AppEnv } from '../http.ts';
import { clearItemImages } from '../lib/images.ts';
import { fetchMetadata } from '../lib/metadata.ts';
import {
  assertOwnedTagIds,
  createItems,
  getItemsWire,
  getOwnedItem,
  ownedItemIds,
  processInputTags,
  setItemTags,
} from '../lib/repo.ts';

const httpUrl = z
  .string()
  .trim()
  .refine((value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, 'Enter a valid http or https URL');

const itemSchema = z
  .object({
    type: z.enum(['link', 'note']).default('link'),
    title: z.string().trim().min(1, 'Title is required').max(1000),
    url: z.union([httpUrl, z.literal('')]).default(''),
    description: z.string().max(10_000).default(''),
    comments: z.string().max(100_000).default(''),
    body: z.string().max(2_000_000).nullable().optional(),
    image: z
      .union([httpUrl, z.literal('')])
      .optional()
      .default(''),
    tags: z.array(z.union([z.string(), z.number()])).default([]),
  })
  .refine((item) => item.type === 'note' || item.url !== '', { message: 'URL is required', path: ['url'] });

const idList = z.array(z.coerce.number().int().positive()).min(1, 'Select at least one item');

export const itemRoutes = new Hono<AppEnv>()
  .get('/items', (c) => c.json(getItemsWire(c.var.user.id)))
  .post('/items', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(itemSchema, await c.req.json());
    const tagIds = processInputTags(userId, input.tags);
    const [itemId] = createItems(userId, [{ ...input, tagIds }]);
    publish(userId, ['items', 'tags'], clientIdOf(c));
    return success(c, 'Item created successfully', { item_id: itemId });
  })
  .patch('/items', async (c) => {
    const userId = c.var.user.id;
    const itemId = Number(c.req.query('item-id'));
    const existing = getOwnedItem(userId, itemId);
    const raw = await c.req.json();
    const input = parseInput(itemSchema, raw);
    const forceImageRefetch = raw['force-image-refetch'] === true;
    const tagIds = processInputTags(userId, input.tags);

    db.update(items)
      .set({
        type: input.type,
        title: input.title,
        url: input.url,
        description: input.description,
        comments: input.comments,
        body: input.body === undefined ? existing.body : input.body,
        image: input.image,
        updatedAt: nowIso(),
      })
      .where(and(eq(items.id, itemId), eq(items.userId, userId)))
      .run();
    setItemTags(itemId, tagIds);

    if (!input.image || forceImageRefetch || input.image !== existing.image) {
      clearItemImages([itemId]);
    }
    publish(userId, ['items', 'tags'], clientIdOf(c));
    return success(c, 'Item updated successfully', { item_id: itemId });
  })
  .post('/items/delete', async (c) => {
    const userId = c.var.user.id;
    const { 'item-ids': requested } = parseInput(z.object({ 'item-ids': idList }), await c.req.json());
    const ids = ownedItemIds(userId, requested);
    db.delete(items)
      .where(and(eq(items.userId, userId), inArray(items.id, ids)))
      .run();
    clearItemImages(ids);
    publish(userId, ['items'], clientIdOf(c));
    return success(c, ids.length === 1 ? 'Item deleted successfully' : `${ids.length} items deleted successfully`);
  })
  .patch('/items/tags', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(
      z.object({
        'item-ids': idList,
        'tag-ids-all': z.array(z.coerce.number().int()),
        'tag-ids-some': z.array(z.coerce.number().int()),
      }),
      await c.req.json()
    );
    const ids = ownedItemIds(userId, input['item-ids']);
    assertOwnedTagIds(userId, [...input['tag-ids-all'], ...input['tag-ids-some']]);

    // Tags only some of the items had stay as they are; every other tag is replaced by "all".
    db.transaction((tx) => {
      const keep = input['tag-ids-some'];
      tx.delete(itemsTags)
        .where(
          keep.length > 0
            ? and(inArray(itemsTags.itemId, ids), notInArray(itemsTags.tagId, keep))
            : inArray(itemsTags.itemId, ids)
        )
        .run();
      const rows = ids.flatMap((itemId) => input['tag-ids-all'].map((tagId) => ({ itemId, tagId })));
      if (rows.length > 0) tx.insert(itemsTags).values(rows).onConflictDoNothing().run();
      tx.update(items).set({ updatedAt: nowIso() }).where(inArray(items.id, ids)).run();
    });
    publish(userId, ['items'], clientIdOf(c));
    return success(c, `Tags updated successfully for ${ids.length === 1 ? '1 item' : `${ids.length} items`}`);
  })
  .post('/items/fetch-metadata', async (c) => {
    const userId = c.var.user.id;
    const { 'item-ids': requested } = parseInput(z.object({ 'item-ids': idList }), await c.req.json());
    const ids = ownedItemIds(userId, requested);
    const rows = db
      .select({ id: items.id, url: items.url })
      .from(items)
      .where(and(eq(items.userId, userId), inArray(items.id, ids)))
      .all()
      .filter((row) => row.url);

    let updated = 0;
    const queue = [...rows];
    // A few pages at a time keeps large refetches from flooding the network.
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          const meta = await fetchMetadata(row.url);
          if (!meta.title && !meta.description && !meta.image) continue;
          db.update(items)
            .set({
              title: meta.title ?? new URL(row.url).hostname,
              description: meta.description ?? '',
              image: meta.image ?? '',
              updatedAt: nowIso(),
            })
            .where(eq(items.id, row.id))
            .run();
          clearItemImages([row.id]);
          updated++;
        } catch {
          // Counted as failed below.
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));

    const failed = rows.length - updated;
    const parts: string[] = [];
    if (updated > 0) parts.push(`Successfully refetched ${updated} ${updated === 1 ? 'item' : 'items'}`);
    if (failed > 0) parts.push(`Failed to refetch ${failed} ${failed === 1 ? 'item' : 'items'}`);
    if (updated === 0) throw new HttpError(502, parts.join('. ') || 'Nothing to refetch');
    publish(userId, ['items'], clientIdOf(c));
    return success(c, parts.join('. '));
  });
