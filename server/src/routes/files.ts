import fs from 'node:fs';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { config } from '../config.ts';
import { db, nowIso } from '../db/client.ts';
import { files, items } from '../db/schema.ts';
import { mutate } from '../events.ts';
import { HttpError, parseInput, type AppEnv } from '../http.ts';
import { assertFolderInSpace, loadItem, requireRole } from '../lib/access.ts';
import { getItemWire } from '../lib/data.ts';
import {
  cleanFileName,
  clearItemStorage,
  filePath,
  isInlineType,
  isPassiveType,
  kindForMime,
  mimeFor,
  titleFromFileName,
  writeUpload,
} from '../lib/files.ts';
import { idSchema, newId } from '../lib/ids.ts';
import { UPLOAD_THUMBNAIL, writeCachedImage } from '../lib/images.ts';
import { isValidPosition, itemPositionsAtTop } from '../lib/positions.ts';

const THUMBNAIL_TYPES = ['image/webp', 'image/jpeg', 'image/png'];

const thumbnailLimit = bodyLimit({
  maxSize: 2 * 1024 * 1024,
  onError: () => {
    throw new HttpError(413, 'Thumbnails can be up to 2 MB');
  },
});

const contentDisposition = (type: 'inline' | 'attachment', name: string) =>
  `${type}; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;

// Sends a stored file: inline when the browser can show it safely, otherwise as a download. Supports
// byte ranges so videos can seek. Add ?download to always save it. Used by members and public pages.
export function fileResponse(c: Context, file: typeof files.$inferSelect): Response {
  const fullPath = filePath(file.itemId, file.id);
  if (!fs.existsSync(fullPath)) throw new HttpError(404, 'This file is missing from the server');
  const size = fs.statSync(fullPath).size;

  const inline = c.req.query('download') === undefined && isInlineType(file.mime);
  const headers = new Headers({
    'content-type': inline ? file.mime : 'application/octet-stream',
    'content-disposition': contentDisposition(inline ? 'inline' : 'attachment', file.name),
    'cache-control': 'private, max-age=31536000, immutable',
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
  });
  // Uploaded SVGs and text could carry script; never let it run on this origin.
  if (!isPassiveType(file.mime)) {
    headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  }

  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '');
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      headers.set('content-range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    status = 206;
    headers.set('content-range', `bytes ${start}-${end}/${size}`);
  }
  headers.set('content-length', String(end - start + 1));
  if (c.req.method === 'HEAD' || size === 0) return new Response(null, { status, headers });
  const stream = Readable.toWeb(fs.createReadStream(fullPath, { start, end })) as ReadableStream;
  return new Response(stream, { status, headers });
}

export const fileRoutes = new Hono<AppEnv>()
  // The file is the raw request body, so large uploads stream straight to disk.
  // Query: spaceId, name, and optionally id (chosen by the client), folderId (none = Inbox) and position.
  .post('/items/upload', async (c) => {
    const userId = c.var.user.id;
    const input = parseInput(
      z.object({
        spaceId: idSchema,
        id: idSchema.optional(),
        folderId: idSchema.optional(),
        name: z.string().trim().min(1, 'File name is required').max(1000),
        position: z.string().max(200).optional(),
      }),
      c.req.query()
    );
    const folderId = input.folderId ?? null;
    requireRole(userId, input.spaceId, 'editor');
    assertFolderInSpace(folderId, input.spaceId);
    const id = input.id ?? newId();
    if (db.select({ id: items.id }).from(items).where(eq(items.id, id)).get()) {
      throw new HttpError(409, 'An item with this ID already exists');
    }
    if (Number(c.req.header('content-length')) > config.maxUploadBytes) {
      throw new HttpError(413, `Files can be up to ${config.maxUploadBytes / 1024 / 1024} MB`);
    }
    const body = c.req.raw.body;
    if (!body) throw new HttpError(422, 'The file is empty');

    const name = cleanFileName(input.name);
    const mime = mimeFor(c.req.header('content-type'), name);
    const fileId = newId();
    const size = await writeUpload(body, filePath(id, fileId), config.maxUploadBytes);
    try {
      if (size === 0) throw new HttpError(422, 'The file is empty');
      const now = nowIso();
      mutate(input.spaceId, userId, (tx, touch) => {
        const position =
          input.position && isValidPosition(input.position)
            ? input.position
            : itemPositionsAtTop(tx, input.spaceId, folderId, 1)[0];
        tx.insert(items)
          .values({
            id,
            spaceId: input.spaceId,
            folderId,
            kind: kindForMime(mime),
            title: titleFromFileName(name),
            fileId,
            position,
            fetchStatus: 'done',
            createdBy: userId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        tx.insert(files)
          .values({
            id: fileId,
            spaceId: input.spaceId,
            itemId: id,
            name,
            mime,
            size,
            createdBy: userId,
            createdAt: now,
          })
          .run();
        touch({ entity: 'item', id });
      });
    } catch (error) {
      // e.g. the folder was deleted while the file was uploading
      clearItemStorage([id]);
      throw error;
    }
    return c.json(getItemWire(id), 201);
  })
  // A small preview made by the browser (photos are resized, videos give a frame).
  .put('/items/:id/thumbnail', thumbnailLimit, async (c) => {
    const item = loadItem(c.var.user.id, c.req.param('id'), 'editor');
    if (!item.fileId) throw new HttpError(422, 'Only uploaded files take a thumbnail');
    const mime = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!THUMBNAIL_TYPES.includes(mime)) throw new HttpError(415, 'Thumbnails must be WebP, JPEG or PNG');
    const contents = Buffer.from(await c.req.arrayBuffer());
    if (contents.length === 0) throw new HttpError(422, 'The thumbnail is empty');
    writeCachedImage(item.id, UPLOAD_THUMBNAIL, { contents, mime });
    mutate(item.spaceId, c.var.user.id, (tx, touch) => {
      tx.update(items).set({ image: UPLOAD_THUMBNAIL, updatedAt: nowIso() }).where(eq(items.id, item.id)).run();
      touch({ entity: 'item', id: item.id });
    });
    return c.body(null, 204);
  })
  // Serves an uploaded file. Supports byte ranges so videos can seek. Add ?download to save it instead.
  .get('/files/:id', (c) => {
    const file = db
      .select()
      .from(files)
      .where(eq(files.id, c.req.param('id')))
      .get();
    if (!file) throw new HttpError(404, 'File not found');
    requireRole(c.var.user.id, file.spaceId, 'viewer');
    return fileResponse(c, file);
  });
