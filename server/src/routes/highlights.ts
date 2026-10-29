import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db, nowIso } from '../db/client.ts';
import { highlights } from '../db/schema.ts';
import { mutate } from '../events.ts';
import { HttpError, parseInput, type AppEnv } from '../http.ts';
import { loadHighlight, loadItem } from '../lib/access.ts';
import { highlightWire } from '../lib/data.ts';
import { idSchema, newId } from '../lib/ids.ts';

const colorSchema = z.enum(['yellow', 'green', 'blue', 'pink', 'purple']);
const commentSchema = z.string().max(10_000);

const getHighlight = (id: string) => highlightWire(db.select().from(highlights).where(eq(highlights.id, id)).get()!);

// Highlights live in the item's space: anyone who can edit the space can add, change or remove them.
export const highlightRoutes = new Hono<AppEnv>()
  .post('/highlights', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(
      z.object({
        id: idSchema.optional(),
        itemId: idSchema,
        quote: z.string().min(1, 'Select some text to highlight').max(5_000, 'That selection is too long'),
        prefix: z.string().max(200).default(''),
        suffix: z.string().max(200).default(''),
        start: z.number().int().min(0).default(0),
        color: colorSchema.default('yellow'),
        comment: commentSchema.default(''),
      }),
      await c.req.json()
    );
    const item = loadItem(userId, input.itemId, 'editor');
    const id = input.id ?? newId();
    if (db.select({ id: highlights.id }).from(highlights).where(eq(highlights.id, id)).get()) {
      throw new HttpError(409, 'A highlight with this ID already exists');
    }
    const now = nowIso();
    mutate(item.spaceId, userId, (tx, touch) => {
      tx.insert(highlights)
        .values({ ...input, id, spaceId: item.spaceId, createdBy: userId, createdAt: now, updatedAt: now })
        .run();
      touch({ entity: 'highlight', id });
    });
    return c.json(getHighlight(id), 201);
  })
  // Only the colour and the comment change; to mark different text, make a new highlight.
  .patch('/highlights/:id', async (c) => {
    const highlight = loadHighlight(c.var.user.id, c.req.param('id'), 'editor');
    const input = parseInput(z.object({ color: colorSchema, comment: commentSchema }).partial(), await c.req.json());
    mutate(highlight.spaceId, c.var.user.id, (tx, touch) => {
      tx.update(highlights)
        .set({ ...input, updatedAt: nowIso() })
        .where(eq(highlights.id, highlight.id))
        .run();
      touch({ entity: 'highlight', id: highlight.id });
    });
    return c.json(getHighlight(highlight.id));
  })
  .delete('/highlights/:id', (c) => {
    const highlight = loadHighlight(c.var.user.id, c.req.param('id'), 'editor');
    mutate(highlight.spaceId, c.var.user.id, (tx, touch) => {
      tx.delete(highlights).where(eq(highlights.id, highlight.id)).run();
      touch({ entity: 'highlight', id: highlight.id, op: 'delete' });
    });
    return c.body(null, 204);
  });
