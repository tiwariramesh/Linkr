import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HttpError, type AppEnv } from '../http.ts';
import { requireRole } from '../lib/access.ts';
import { importBookmarkHtml, importPocketZip } from '../lib/importers.ts';

const limit = bodyLimit({
  maxSize: 50 * 1024 * 1024,
  onError: () => {
    throw new HttpError(413, 'The file is too large (50 MB maximum)');
  },
});

const SOURCES: Record<string, string> = { browser: 'Browser', raindrop: 'Raindrop.io' };

export const importRoutes = new Hono<AppEnv>()
  .post('/spaces/:id/import/bookmarks', limit, async (c) => {
    const spaceId = c.req.param('id');
    requireRole(c.var.user.id, spaceId, 'editor');
    const form = await c.req.parseBody();
    const source = SOURCES[String(form.source ?? 'browser')];
    if (!source) throw new HttpError(422, 'Invalid import source');
    const file = form.file;
    if (!(file instanceof File)) throw new HttpError(422, 'No file uploaded');
    if (file.type !== 'text/html' && !/\.html?$/i.test(file.name)) {
      throw new HttpError(422, 'Choose the .html file your browser exported');
    }
    return c.json(importBookmarkHtml(c.var.user.id, spaceId, await file.text(), source));
  })
  .post('/spaces/:id/import/pocket', limit, async (c) => {
    const spaceId = c.req.param('id');
    requireRole(c.var.user.id, spaceId, 'editor');
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) throw new HttpError(422, 'No file uploaded');
    if (!/\.zip$/i.test(file.name) && !['application/zip', 'application/x-zip-compressed'].includes(file.type)) {
      throw new HttpError(422, 'Choose the .zip file Pocket exported');
    }
    return c.json(importPocketZip(c.var.user.id, spaceId, new Uint8Array(await file.arrayBuffer())));
  });
