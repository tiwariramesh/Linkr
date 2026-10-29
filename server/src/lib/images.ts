import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { HttpError } from '../http.ts';
import { readLimited, safeFetch } from './safe-fetch.ts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/bmp': 'bmp',
};
const MIME_BY_EXTENSION = Object.fromEntries(Object.entries(EXTENSIONS).map(([mime, ext]) => [ext, mime]));

const itemDir = (itemId: number) => path.join(config.imageDir, String(itemId));
const cacheBaseName = (imageUrl: string) => crypto.createHash('sha1').update(imageUrl).digest('hex');

export type ImageFile = { contents: Buffer; mime: string };

export function readCachedImage(itemId: number, imageUrl: string): ImageFile | null {
  const dir = itemDir(itemId);
  if (!fs.existsSync(dir)) return null;
  const base = cacheBaseName(imageUrl);
  const file = fs.readdirSync(dir).find((name) => name.startsWith(base + '.'));
  if (!file) return null;
  const mime = MIME_BY_EXTENSION[path.extname(file).slice(1)] ?? 'application/octet-stream';
  return { contents: fs.readFileSync(path.join(dir, file)), mime };
}

export function writeCachedImage(itemId: number, imageUrl: string, image: ImageFile) {
  const dir = itemDir(itemId);
  // One cached image per item: drop the previous one when the URL changes.
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${cacheBaseName(imageUrl)}.${EXTENSIONS[image.mime] ?? 'bin'}`), image.contents);
}

export function clearItemImages(itemIds: number[]) {
  for (const id of itemIds) fs.rmSync(itemDir(id), { recursive: true, force: true });
}

export async function fetchRemoteImage(imageUrl: string): Promise<ImageFile> {
  const response = await safeFetch(imageUrl, 'image/avif,image/webp,image/*;q=0.8');
  if (!response.ok) throw new HttpError(502, `Image responded with HTTP ${response.status}`);
  const mime = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!EXTENSIONS[mime]) throw new HttpError(415, 'Not a supported image');
  return { contents: await readLimited(response, MAX_IMAGE_BYTES), mime };
}
