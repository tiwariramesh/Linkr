import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { config } from '../config.ts';
import { subscribe } from '../events.ts';
import { HttpError, parseInput, success, type AppEnv } from '../http.ts';
import { clearItemImages, fetchRemoteImage, readCachedImage, writeCachedImage, type ImageFile } from '../lib/images.ts';
import { fetchMetadata } from '../lib/metadata.ts';
import { getOwnedItem } from '../lib/repo.ts';
import { isRegistrationOpen } from './account.ts';

// ---- Public ----

let latestRelease: { version: string | null; checkedAt: number } = { version: null, checkedAt: 0 };

async function getLatestVersion(): Promise<string | null> {
  if (Date.now() - latestRelease.checkedAt < 6 * 60 * 60 * 1000) return latestRelease.version;
  try {
    const response = await fetch(`https://api.github.com/repos/${config.githubRepo}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'Linkr' },
      signal: AbortSignal.timeout(5000),
    });
    const release = response.ok ? ((await response.json()) as { tag_name?: string }) : null;
    const version = release?.tag_name?.replace(/^v/, '') || null;
    latestRelease = { version, checkedAt: Date.now() };
  } catch {
    latestRelease = { version: null, checkedAt: Date.now() };
  }
  return latestRelease.version;
}

const isNewer = (latest: string, installed: string) => {
  const a = latest.split('.').map(Number);
  const b = installed.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
};

export const publicMiscRoutes = new Hono<AppEnv>().get('/app-info', async (c) => {
  const latest = await getLatestVersion();
  return success(c, 'App info retrieved', {
    installed_version: config.version,
    latest_version: latest,
    update_available: latest ? isNewer(latest, config.version) : null,
    registration_open: isRegistrationOpen(),
  });
});

// ---- Signed in ----

export const miscRoutes = new Hono<AppEnv>()
  .post('/url/fetch-metadata', async (c) => {
    const { url } = parseInput(z.object({ url: z.string().trim().min(1) }), await c.req.json());
    const meta = await fetchMetadata(url);
    if (!meta.title && !meta.description && !meta.image) {
      throw new HttpError(422, 'Failed to extract metadata');
    }
    return success(c, 'Metadata fetched successfully', {
      title: meta.title ?? new URL(url).hostname,
      description: meta.description ?? '',
      image: meta.image ?? '',
      url,
    });
  })
  // Live sync: each open tab keeps one stream and refetches when told something changed.
  .get('/events', (c) => {
    const userId = c.var.user.id;
    c.header('x-accel-buffering', 'no');
    c.header('cache-control', 'no-cache, no-transform');
    return streamSSE(c, async (stream) => {
      const unsubscribe = subscribe(userId, (event) => {
        stream.writeSSE({ event: 'change', data: JSON.stringify(event) }).catch(() => {});
      });
      // Proxies (Cloudflare included) drop idle connections; a comment-like ping keeps it open.
      const ping = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => {});
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

// Image proxy: previews are fetched by the server (with SSRF protection) and cached per item.
export const contentRoutes = new Hono<AppEnv>().get('/content/fetch-image', async (c) => {
  const imageUrl = c.req.query('image-url') ?? '';
  const itemIdParam = c.req.query('item-id');
  const itemId = itemIdParam ? Number(itemIdParam) : null;
  if (itemId !== null) getOwnedItem(c.var.user.id, itemId);

  const respond = (image: ImageFile | null, maxAgeSeconds: number) => {
    c.header('cache-control', maxAgeSeconds > 0 ? `private, max-age=${maxAgeSeconds}` : 'no-store');
    c.header('x-content-type-options', 'nosniff');
    // SVGs can carry scripts; never let one run on this origin.
    c.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    if (!image) return c.body(null, 404);
    c.header('content-type', image.mime);
    return c.body(new Uint8Array(image.contents));
  };

  if (itemId !== null) {
    const cached = readCachedImage(itemId, imageUrl);
    if (cached) return respond(cached, 7 * 24 * 60 * 60);
  }
  let image: ImageFile;
  try {
    image = await fetchRemoteImage(imageUrl);
  } catch {
    return respond(null, itemId !== null ? 60 * 60 : 0);
  }
  if (itemId === null) return respond(image, 0);
  try {
    writeCachedImage(itemId, imageUrl, image);
  } catch {
    clearItemImages([itemId]);
  }
  return respond(image, 7 * 24 * 60 * 60);
});
