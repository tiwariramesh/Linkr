import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { db, nowIso } from '../db/client.ts';
import { items, spaceMembers, spaces } from '../db/schema.ts';
import { mutate, subscribe } from '../events.ts';
import { HttpError, parseInput, type AppEnv } from '../http.ts';
import { requireRole } from '../lib/access.ts';
import { changesSince, spaceSnapshot, spaceWire, userSpaces } from '../lib/data.ts';
import { idSchema, newId } from '../lib/ids.ts';
import { searchSpace } from '../lib/search.ts';
import { clearItemStorage } from '../lib/files.ts';

const COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'] as const;
export const colorSchema = z.enum(COLORS);

const spaceInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  icon: z.string().max(16).nullable().optional(),
  color: colorSchema.optional(),
});

export function createSpace(userId: string, name: string, kind: 'personal' | 'team', id = newId()) {
  const now = nowIso();
  db.transaction((tx) => {
    tx.insert(spaces)
      .values({ id, name, kind, color: 'orange', createdBy: userId, createdAt: now, updatedAt: now })
      .run();
    tx.insert(spaceMembers).values({ spaceId: id, userId, role: 'owner', createdAt: now }).run();
  });
  return id;
}

export const spaceRoutes = new Hono<AppEnv>()
  .get('/spaces', (c) => c.json(userSpaces(c.var.user.id)))
  .post('/spaces', async (c) => {
    const input = parseInput(spaceInput.extend({ id: idSchema.optional() }), await c.req.json());
    const id = createSpace(c.var.user.id, input.name, 'team', input.id);
    if (input.icon !== undefined || input.color) {
      db.update(spaces)
        .set({ icon: input.icon ?? null, color: input.color ?? 'orange' })
        .where(eq(spaces.id, id))
        .run();
    }
    const space = db.select().from(spaces).where(eq(spaces.id, id)).get()!;
    return c.json(spaceWire(space, 'owner'), 201);
  })
  .patch('/spaces/:id', async (c) => {
    const spaceId = c.req.param('id');
    requireRole(c.var.user.id, spaceId, 'owner');
    const input = parseInput(spaceInput.partial(), await c.req.json());
    mutate(spaceId, c.var.user.id, (tx, touch) => {
      tx.update(spaces)
        .set({ ...input, updatedAt: nowIso() })
        .where(eq(spaces.id, spaceId))
        .run();
      touch({ entity: 'space', id: spaceId });
    });
    const space = db.select().from(spaces).where(eq(spaces.id, spaceId)).get()!;
    return c.json(spaceWire(space, 'owner'));
  })
  .delete('/spaces/:id', (c) => {
    const spaceId = c.req.param('id');
    requireRole(c.var.user.id, spaceId, 'owner');
    const personal = userSpaces(c.var.user.id).filter((space) => space.kind === 'personal');
    if (personal.length === 1 && personal[0].id === spaceId) {
      throw new HttpError(422, 'Your Personal space cannot be deleted');
    }
    const itemIds = db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.spaceId, spaceId))
      .all()
      .map((row) => row.id);
    db.delete(spaces).where(eq(spaces.id, spaceId)).run();
    clearItemStorage(itemIds);
    return c.body(null, 204);
  })
  .get('/spaces/:id/snapshot', (c) => {
    const spaceId = c.req.param('id');
    requireRole(c.var.user.id, spaceId, 'viewer');
    return c.json(spaceSnapshot(spaceId));
  })
  .get('/spaces/:id/changes', (c) => {
    const spaceId = c.req.param('id');
    requireRole(c.var.user.id, spaceId, 'viewer');
    const since = Number(c.req.query('since') ?? 0);
    if (!Number.isInteger(since) || since < 0) throw new HttpError(422, 'Invalid "since"');
    return c.json(changesSince(spaceId, since));
  })
  // Full-text search across the space's items, reader copies, highlights and session notes.
  .get('/spaces/:id/search', (c) => {
    const spaceId = c.req.param('id');
    requireRole(c.var.user.id, spaceId, 'viewer');
    const q = (c.req.query('q') ?? '').slice(0, 200);
    return c.json({ hits: searchSpace(spaceId, q) });
  })
  // One stream per open tab. It only says "space X is now at seq N"; the tab fetches the rows itself.
  .get('/events', (c) => {
    const userId = c.var.user.id;
    c.header('x-accel-buffering', 'no');
    c.header('cache-control', 'no-cache, no-transform');
    return streamSSE(c, async (stream) => {
      const unsubscribe = subscribe(userId, (event) => {
        stream.writeSSE({ event: 'change', data: JSON.stringify(event) }).catch(() => {});
      });
      // Proxies (Cloudflare included) drop idle connections; a periodic ping keeps it open.
      const ping = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
      }, 25_000);
      stream.onAbort(() => {
        clearInterval(ping);
        unsubscribe();
      });
      await stream.writeSSE({ event: 'ready', data: '{}', retry: 3000 });
      while (!stream.aborted && !stream.closed) {
        await stream.sleep(60_000);
      }
      clearInterval(ping);
      unsubscribe();
    });
  });
