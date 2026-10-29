import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { publish, clientIdOf } from '../events.ts';
import { HttpError, success, type AppEnv } from '../http.ts';
import { importBookmarkHtml, importPocketZip } from '../lib/importers.ts';

const limit = bodyLimit({
  maxSize: 50 * 1024 * 1024,
  onError: () => {
    throw new HttpError(413, 'The file is too large (50 MB maximum)');
  },
});

const SOURCES: Record<string, string> = { browser: 'browser', 'Raindrop.io': 'Raindrop.io' };

export const importRoutes = new Hono<AppEnv>()
  .post('/import/bookmarks', limit, async (c) => {
    const form = await c.req.parseBody();
    const source = SOURCES[String(form['import-source-name'] ?? '')];
    if (!source) throw new HttpError(422, 'Invalid import source');
    const file = form['bookmark-file-html'];
    if (!(file instanceof File)) throw new HttpError(422, 'No file uploaded');
    if (file.type !== 'text/html' && !/\.html?$/i.test(file.name)) {
      throw new HttpError(422, 'Uploaded file is not an HTML file');
    }
    const { imported, skipped } = importBookmarkHtml(c.var.user.id, await file.text(), source);
    publish(c.var.user.id, ['items', 'tags'], clientIdOf(c));
    return success(c, `${imported} bookmarks imported successfully, ${skipped} bookmarks skipped.`);
  })
  .post('/import/pocket', limit, async (c) => {
    const form = await c.req.parseBody();
    const file = form['pocket-zip'];
    if (!(file instanceof File)) throw new HttpError(422, 'No file uploaded');
    if (!/\.zip$/i.test(file.name) && !['application/zip', 'application/x-zip-compressed'].includes(file.type)) {
      throw new HttpError(422, 'Uploaded file is not a ZIP archive');
    }
    const count = importPocketZip(c.var.user.id, new Uint8Array(await file.arrayBuffer()));
    publish(c.var.user.id, ['items', 'tags'], clientIdOf(c));
    return success(c, `${count} Pocket bookmarks imported successfully`);
  });
