import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, nowIso } from '../db/client.ts';
import { itemTags, tags } from '../db/schema.ts';
import { mutate } from '../events.ts';
import { HttpError, parseInput, type AppEnv } from '../http.ts';
import { loadTag, requireRole } from '../lib/access.ts';
import { tagWire } from '../lib/data.ts';
import { idSchema, newId } from '../lib/ids.ts';
import { colorSchema } from './spaces.ts';

const title = z.string().trim().min(1, 'Tag name is required').max(80);

export const tagRoutes = new Hono<AppEnv>()
  .post('/tags', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(
      z.object({ id: idSchema.optional(), spaceId: idSchema, title, color: colorSchema.nullable().optional() }),
      await c.req.json()
    );
    requireRole(userId, input.spaceId, 'editor');
    const existing = db
      .select()
      .from(tags)
      .where(eq(tags.spaceId, input.spaceId))
      .all()
      .find((tag) => tag.title.toLowerCase() === input.title.toLowerCase());
    if (existing) throw new HttpError(409, `A tag named "${existing.title}" already exists`);
    const id = input.id ?? newId();
    const now = nowIso();
    mutate(input.spaceId, userId, (tx, touch) => {
      tx.insert(tags)
        .values({
          id,
          spaceId: input.spaceId,
          title: input.title,
          color: input.color ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      touch({ entity: 'tag', id });
    });
    return c.json(tagWire(db.select().from(tags).where(eq(tags.id, id)).get()!), 201);
  })
  .patch('/tags/:id', async (c) => {
    const tag = loadTag(c.var.user.id, c.req.param('id'), 'editor');
    const input = parseInput(z.object({ title, color: colorSchema.nullable() }).partial(), await c.req.json());
    mutate(tag.spaceId, c.var.user.id, (tx, touch) => {
      tx.update(tags)
        .set({ ...input, updatedAt: nowIso() })
        .where(eq(tags.id, tag.id))
        .run();
      touch({ entity: 'tag', id: tag.id });
    });
    return c.json(tagWire(db.select().from(tags).where(eq(tags.id, tag.id)).get()!));
  })
  .delete('/tags/:id', (c) => {
    const tag = loadTag(c.var.user.id, c.req.param('id'), 'editor');
    // Items lose the tag too; they are reported as changed so devices drop it.
    const taggedItems = db.select({ id: itemTags.itemId }).from(itemTags).where(eq(itemTags.tagId, tag.id)).all();
    mutate(tag.spaceId, c.var.user.id, (tx, touch) => {
      tx.delete(tags).where(eq(tags.id, tag.id)).run();
      touch({ entity: 'tag', id: tag.id, op: 'delete' });
      taggedItems.forEach((row) => touch({ entity: 'item', id: row.id }));
    });
    return c.body(null, 204);
  });
