import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { createMiddleware } from 'hono/factory';
import { secureHeaders } from 'hono/secure-headers';
import { auth } from './auth.ts';
import { config } from './config.ts';
import { migrateDatabase } from './db/client.ts';
import { errorResponse, HttpError, type AppEnv } from './http.ts';
import { resumePendingFetches } from './lib/link-queue.ts';
import { purgeOldTrash } from './lib/maintenance.ts';
import { accountRoutes, publicAccountRoutes } from './routes/account.ts';
import { appInfoRoutes } from './routes/app-info.ts';
import { fileRoutes } from './routes/files.ts';
import { folderRoutes } from './routes/folders.ts';
import { highlightRoutes } from './routes/highlights.ts';
import { importRoutes } from './routes/imports.ts';
import { itemRoutes } from './routes/items.ts';
import { publicRoutes } from './routes/public.ts';
import { sharingRoutes } from './routes/sharing.ts';
import { spaceRoutes } from './routes/spaces.ts';
import { tagRoutes } from './routes/tags.ts';

migrateDatabase();
purgeOldTrash();
setInterval(purgeOldTrash, 24 * 60 * 60 * 1000).unref();
resumePendingFetches();

const app = new Hono<AppEnv>();
app.onError(errorResponse);

// Browsers send Origin on every state-changing request; refuse ones from sites we don't serve.
app.use('/api/*', async (c, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin && !config.trustedOrigins.includes(origin)) {
      const host = c.req.header('host');
      if (!host || new URL(origin).host !== host) {
        throw new HttpError(403, 'Request blocked: unknown origin');
      }
    }
  }
  await next();
});

app.use('*', secureHeaders({ crossOriginResourcePolicy: 'same-origin', referrerPolicy: 'same-origin' }));

const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new HttpError(401, 'Please sign in');
  c.set('user', session.user);
  await next();
});

const api = new Hono<AppEnv>();
api.route('/', publicAccountRoutes);
api.route('/', appInfoRoutes);
api.route('/', publicRoutes);
api.use('*', requireUser);
api.route('/', accountRoutes);
api.route('/', spaceRoutes);
api.route('/', folderRoutes);
api.route('/', itemRoutes);
api.route('/', fileRoutes);
api.route('/', tagRoutes);
api.route('/', highlightRoutes);
api.route('/', sharingRoutes);
api.route('/', importRoutes);
api.all('*', () => {
  throw new HttpError(404, 'Not found');
});
app.route('/api', api);

// ---- The built PWA ----

const indexHtmlPath = path.join(config.frontendDist, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
  const root = path.relative(process.cwd(), config.frontendDist) || '.';
  app.use('*', compress());
  app.use(
    '/assets/*',
    serveStatic({
      root,
      onFound: (_path, c) => {
        c.header('cache-control', 'public, max-age=31536000, immutable');
      },
    })
  );
  app.use('*', serveStatic({ root }));
  // Client-side routes (/login, /edit-item/12 ...) all load the app shell.
  app.get('*', (c) => {
    c.header('cache-control', 'no-cache');
    return c.html(fs.readFileSync(indexHtmlPath, 'utf8'));
  });
} else {
  app.get('/', (c) =>
    c.text('Linkr API is running. Build the front end with "npm run build" to serve the app from here.')
  );
}

serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(
    `Linkr ${config.version} listening on http://${info.address}:${info.port}  (public URL: ${config.baseUrl})`
  );
});
