import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, nowIso } from '../db/client.ts';
import { tags } from '../db/schema.ts';
import { clientIdOf, publish } from '../events.ts';
import { HttpError, parseInput, success, type AppEnv } from '../http.ts';
import { createTagsFromSegments, descendantTagIds, extractTagSegments, getOwnedTag, getTagsWire } from '../lib/repo.ts';

const TAG_COLORS = ['gray', 'green', 'red', 'yellow', 'aqua', 'white', 'black'] as const;

export const tagRoutes = new Hono<AppEnv>()
  .get('/tags', (c) => c.json(getTagsWire(c.var.user.id)))
  .post('/tags', async (c) => {
    const userId = c.var.user.id;
    const { title } = parseInput(
      z.object({ title: z.string().trim().min(1, 'Tag title is required') }),
      await c.req.json()
    );
    const tagId = createTagsFromSegments(userId, extractTagSegments(title));
    publish(userId, ['tags'], clientIdOf(c));
    return success(c, 'Tag created successfully', { tag_id: tagId, title });
  })
  .delete('/tags', (c) => {
    const userId = c.var.user.id;
    const tagId = Number(c.req.query('tag-id'));
    getOwnedTag(userId, tagId);
    // Deleting a tag removes its whole subtree; item links go with it via ON DELETE CASCADE.
    const ids = descendantTagIds(userId, tagId);
    db.delete(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, ids)))
      .run();
    publish(userId, ['tags', 'items'], clientIdOf(c));
    return success(c, `${ids.length > 1 ? `${ids.length} tags` : 'Tag'} deleted successfully`);
  })
  .patch('/tags/update', async (c) => {
    const userId = c.var.user.id;
    const tagId = Number(c.req.query('tag-id'));
    getOwnedTag(userId, tagId);
    const input = parseInput(
      z.object({
        title: z.string().trim().min(1, 'Tag title is required'),
        description: z.string().default(''),
        parent: z.coerce.number().int().min(0),
      }),
      await c.req.json()
    );
    if (input.parent !== 0) {
      getOwnedTag(userId, input.parent);
      if (descendantTagIds(userId, tagId).includes(input.parent)) {
        throw new HttpError(422, 'A tag cannot be moved inside itself');
      }
    }
    db.update(tags)
      .set({ title: input.title, description: input.description, parent: input.parent, updatedAt: nowIso() })
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .run();
    publish(userId, ['tags'], clientIdOf(c));
    return success(c, 'Tag updated successfully');
  })
  .patch('/tags/update-color', async (c) => {
    const userId = c.var.user.id;
    const tagId = Number(c.req.query('tag-id'));
    getOwnedTag(userId, tagId);
    const { color } = parseInput(z.object({ color: z.enum(TAG_COLORS) }), await c.req.json());
    db.update(tags)
      .set({ color, updatedAt: nowIso() })
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .run();
    publish(userId, ['tags'], clientIdOf(c));
    return success(c, 'Tag color updated successfully');
  })
  .patch('/tags/update-pinned', async (c) => {
    const userId = c.var.user.id;
    const tagId = Number(c.req.query('tag-id'));
    getOwnedTag(userId, tagId);
    const { pinned } = parseInput(z.object({ pinned: z.boolean() }), await c.req.json());
    db.update(tags)
      .set({ pinned, updatedAt: nowIso() })
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .run();
    publish(userId, ['tags'], clientIdOf(c));
    return success(c, pinned ? 'Tag pinned' : 'Tag unpinned');
  });
