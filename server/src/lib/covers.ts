import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';

// Folder cover images, stored at data/covers/<spaceId>/<folderId>/<token>.<ext>. The token changes with
// every upload, so a cover can be cached for good under its own address.

export const COVER_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
const MIME_BY_EXTENSION = Object.fromEntries(Object.entries(COVER_TYPES).map(([mime, ext]) => [ext, mime]));

const folderDir = (spaceId: string, folderId: string) => path.join(config.coverDir, spaceId, folderId);

// Replaces the folder's cover. Returns the token to store as `upload:<token>`.
export function saveCover(spaceId: string, folderId: string, contents: Buffer, mime: string): string {
  const dir = folderDir(spaceId, folderId);
  const token = crypto.randomBytes(9).toString('base64url');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${token}.${COVER_TYPES[mime]}`), contents);
  return token;
}

export function readCover(spaceId: string, folderId: string, token: string) {
  const dir = folderDir(spaceId, folderId);
  if (!fs.existsSync(dir)) return null;
  const file = fs.readdirSync(dir).find((name) => name.startsWith(`${token}.`));
  if (!file) return null;
  return { contents: fs.readFileSync(path.join(dir, file)), mime: MIME_BY_EXTENSION[path.extname(file).slice(1)] };
}

export function copyCover(spaceId: string, fromFolderId: string, toFolderId: string) {
  const from = folderDir(spaceId, fromFolderId);
  if (fs.existsSync(from)) fs.cpSync(from, folderDir(spaceId, toFolderId), { recursive: true });
}

export function clearCovers(spaceId: string, folderIds: string[]) {
  for (const id of folderIds) fs.rmSync(folderDir(spaceId, id), { recursive: true, force: true });
}

export function clearSpaceCovers(spaceIds: string[]) {
  for (const id of spaceIds) fs.rmSync(path.join(config.coverDir, id), { recursive: true, force: true });
}
