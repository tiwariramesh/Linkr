import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { publicUser } from '../auth.ts';
import { db, nowIso } from '../db/client.ts';
import { folders, items, spaceMembers } from '../db/schema.ts';
import { mutate } from '../events.ts';
import { HttpError, parseInput, rateLimiter, type AppEnv } from '../http.ts';
import { assertFolderInSpace, loadFolder, requireRole } from '../lib/access.ts';
import { folderWire, userSpaces } from '../lib/data.ts';
import { idSchema, newId } from '../lib/ids.ts';
import { enqueueFetch, placeholderTitle } from '../lib/link-queue.ts';
import { isVideoUrl } from '../lib/metadata.ts';
import { folderPositionAtEnd, itemPositionsAtTop } from '../lib/positions.ts';
import { createToken, listTokens, revokeToken } from '../lib/tokens.ts';
import { httpUrl } from './items.ts';
import { colorSchema } from './spaces.ts';

// What the Linkr browser extension needs beyond the regular API: connecting (tokens), a light list of
// folders to save into, "is this page already saved?", and tab groups <-> session folders.

// Managing tokens needs the signed-in website, not a token.
export function requireSession(c: Context<AppEnv>) {
  if (c.var.via !== 'session') throw new HttpError(403, 'Do this from the Linkr website');
}

const limitTokens = rateLimiter(20, 60_000);

// The same page is often saved with or without its #fragment or trailing slash.
function urlVariants(url: string) {
  const variants = new Set([url]);
  const noHash = url.split('#')[0];
  variants.add(noHash);
  for (const value of [...variants]) variants.add(value.endsWith('/') ? value.slice(0, -1) : value + '/');
  return [...variants];
}

const memberSpaceIds = (userId: string) =>
  db
    .select({ id: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(eq(spaceMembers.userId, userId))
    .all()
    .map((row) => row.id);

export const extensionRoutes = new Hono<AppEnv>()
  .get('/extension/tokens', (c) => {
    requireSession(c);
    return c.json(listTokens(c.var.user.id));
  })
  .post('/extension/tokens', async (c) => {
    requireSession(c);
    limitTokens(c);
    const { name } = parseInput(z.object({ name: z.string().trim().min(1).max(80) }), await c.req.json());
    return c.json(createToken(c.var.user.id, name), 201);
  })
  .delete('/extension/tokens/:id', (c) => {
    requireSession(c);
    if (!revokeToken(c.var.user.id, c.req.param('id'))) throw new HttpError(404, 'Not found');
    return c.body(null, 204);
  })

  // Who's connected, their spaces, and every folder they can see (no items: the popup stays fast).
  .get('/extension/state', (c) => {
    const userId = c.var.user.id;
    const spaceIds = memberSpaceIds(userId);
    const rows = spaceIds.length
      ? db
          .select()
          .from(folders)
          .where(and(inArray(folders.spaceId, spaceIds), isNull(folders.deletedAt)))
          .orderBy(asc(folders.position))
          .all()
      : [];
    return c.json({
      user: publicUser(c.var.user),
      spaces: userSpaces(userId),
      folders: rows.map((folder) => {
        const { id, spaceId, parentId, title, icon, color, position, sessionDate, term } = folderWire(folder);
        return { id, spaceId, parentId, title, icon, color, position, sessionDate, term };
      }),
    });
  })

  // Where a page is already saved, across all the user's spaces.
  .get('/extension/lookup', (c) => {
    const url = c.req.query('url') ?? '';
    if (!httpUrl.safeParse(url).success) return c.json({ saved: [] });
    const spaceIds = memberSpaceIds(c.var.user.id);
    if (!spaceIds.length) return c.json({ saved: [] });
    const saved = db
      .select({ itemId: items.id, spaceId: items.spaceId, folderId: items.folderId, title: items.title })
      .from(items)
      .where(and(inArray(items.spaceId, spaceIds), inArray(items.url, urlVariants(url)), isNull(items.deletedAt)))
      .limit(20)
      .all();
    return c.json({ saved });
  })

  // Save many tabs at once, in order, into a folder: an existing one, or a new session folder.
  .post('/extension/tabs', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(
      z.object({
        spaceId: idSchema,
        folderId: idSchema.nullable().default(null),
        newFolder: z
          .object({
            title: z.string().trim().min(1, 'Name the session').max(200),
            parentId: idSchema.nullable().default(null),
            color: colorSchema.nullable().default(null),
            sessionDate: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable()
              .default(null),
            term: z.string().trim().max(40).nullable().default(null),
          })
          .optional(),
        tabs: z
          .array(z.object({ url: httpUrl, title: z.string().trim().max(1000).default('') }))
          .min(1, 'No tabs to save')
          .max(200),
      }),
      await c.req.json()
    );
    requireRole(userId, input.spaceId, 'editor');
    const parentId = input.newFolder ? input.newFolder.parentId : input.folderId;
    assertFolderInSpace(parentId, input.spaceId);

    const seen = new Set<string>();
    const tabs = input.tabs.filter((tab) => !seen.has(tab.url) && seen.add(tab.url));
    const folderId = input.newFolder ? newId() : input.folderId;
    const ids = tabs.map(() => newId());
    const now = nowIso();
    mutate(input.spaceId, userId, (tx, touch) => {
      if (input.newFolder) {
        const folder = input.newFolder;
        tx.insert(folders)
          .values({
            id: folderId!,
            spaceId: input.spaceId,
            parentId: folder.parentId,
            title: folder.title,
            color: folder.color,
            position: folderPositionAtEnd(tx, input.spaceId, folder.parentId),
            sessionDate: folder.sessionDate,
            term: folder.term,
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        touch({ entity: 'folder', id: folderId! });
      }
      const positions = itemPositionsAtTop(tx, input.spaceId, folderId, tabs.length);
      tabs.forEach((tab, index) => {
        tx.insert(items)
          .values({
            id: ids[index],
            spaceId: input.spaceId,
            folderId,
            kind: isVideoUrl(tab.url) ? 'video' : 'link',
            url: tab.url,
            title: tab.title || placeholderTitle(tab.url),
            position: positions[index],
            fetchStatus: 'pending',
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        touch({ entity: 'item', id: ids[index] });
      });
    });
    for (const id of ids) enqueueFetch(id);
    return c.json({ folderId, saved: tabs.length }, 201);
  })

  // A folder's links in order, to open as a tab group.
  .get('/extension/folders/:id/tabs', (c) => {
    const folder = loadFolder(c.var.user.id, c.req.param('id'), 'viewer');
    const tabs = db
      .select({ url: items.url, title: items.title })
      .from(items)
      .where(and(eq(items.folderId, folder.id), isNull(items.deletedAt), ne(items.url, '')))
      .orderBy(asc(items.position))
      .all();
    return c.json({ folder: { id: folder.id, title: folder.title, color: folder.color }, tabs });
  });
