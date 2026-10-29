import { and, asc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../db/client.ts';
import { files, folders, items } from '../db/schema.ts';
import { HttpError, rateLimiter, type AppEnv } from '../http.ts';
import { readCover } from '../lib/covers.ts';
import { fileResponse } from './files.ts';
import { itemImageResponse } from './items.ts';

// Public, read-only pages for folders shared with a link (/p/<token>). No sign-in: the token is the
// key. Only the folder's own items are shown; private item notes never are, and session notes only
// when the sharer included them. Search engines are asked not to index these pages.

const limitPublic = rateLimiter(240, 60_000);

function sharedFolder(token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) throw new HttpError(404, 'This link isn’t shared any more');
  const folder = db.select().from(folders).where(eq(folders.shareToken, token)).get();
  if (!folder || folder.deletedAt) throw new HttpError(404, 'This link isn’t shared any more');
  return folder;
}

function sharedItem(token: string, itemId: string) {
  const folder = sharedFolder(token);
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item || item.folderId !== folder.id || item.deletedAt) throw new HttpError(404, 'Not found');
  return item;
}

export const publicRoutes = new Hono<AppEnv>()
  .use('/public/*', async (c, next) => {
    limitPublic(c);
    await next();
    c.header('x-robots-tag', 'noindex, nofollow');
  })
  .get('/public/:token', (c) => {
    const folder = sharedFolder(c.req.param('token'));
    const list = db
      .select()
      .from(items)
      .where(and(eq(items.folderId, folder.id), isNull(items.deletedAt)))
      .orderBy(asc(items.position))
      .all();
    const fileRows = new Map(
      list
        .flatMap((item) => (item.fileId ? db.select().from(files).where(eq(files.id, item.fileId)).all() : []))
        .map((f) => [f.id, f])
    );
    return c.json({
      folder: {
        title: folder.title,
        description: folder.description,
        // Uploaded covers are served below; gradients are just names.
        cover: folder.cover,
        icon: folder.icon,
        color: folder.color,
        sessionDate: folder.sessionDate,
        term: folder.term,
        notes: folder.shareNotes ? { body: folder.body, text: folder.notes } : null,
        updatedAt: folder.updatedAt,
      },
      items: list.map((item) => {
        const file = item.fileId ? fileRows.get(item.fileId) : undefined;
        return {
          id: item.id,
          kind: item.kind,
          title: item.title,
          url: item.url,
          description: item.description,
          siteName: item.siteName,
          favicon: item.favicon,
          hasImage: !!item.image,
          // A note's text is its content; notes *about* links stay private.
          notes: item.kind === 'note' ? item.notes : '',
          body: item.kind === 'note' ? item.body : null,
          file: file ? { id: file.id, name: file.name, mime: file.mime, size: file.size } : null,
          updatedAt: item.updatedAt,
        };
      }),
    });
  })
  .get('/public/:token/cover', (c) => {
    const folder = sharedFolder(c.req.param('token'));
    const token = folder.cover?.startsWith('upload:') ? folder.cover.slice('upload:'.length) : null;
    const image = token ? readCover(folder.spaceId, folder.id, token) : null;
    if (!image) throw new HttpError(404, 'No cover');
    c.header('content-type', image.mime);
    c.header('cache-control', 'public, max-age=3600');
    c.header('x-content-type-options', 'nosniff');
    return c.body(new Uint8Array(image.contents));
  })
  .get('/public/:token/items/:itemId/image', (c) =>
    itemImageResponse(c, sharedItem(c.req.param('token'), c.req.param('itemId')))
  )
  .get('/public/:token/files/:fileId', (c) => {
    const folder = sharedFolder(c.req.param('token'));
    const file = db
      .select()
      .from(files)
      .where(eq(files.id, c.req.param('fileId')))
      .get();
    const item = file && db.select().from(items).where(eq(items.id, file.itemId)).get();
    if (!file || !item || item.folderId !== folder.id || item.deletedAt) throw new HttpError(404, 'Not found');
    return fileResponse(c, file);
  });
