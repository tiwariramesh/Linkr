import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { config } from '../config.ts';
import { HttpError } from '../http.ts';
import { clearItemImages } from './images.ts';

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// Types the browser may show in place. Everything else is served as a download.
const INLINE_TYPES =
  /^(image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)|video\/(mp4|webm|ogg|quicktime)|audio\/[\w.+-]+|application\/pdf|text\/plain)$/;

// Types that cannot carry script, so they need no sandbox (a sandbox would also stop the PDF viewer).
const PASSIVE_TYPES = /^(application\/pdf|video\/[\w.+-]+|audio\/[\w.+-]+)$/;

export const isInlineType = (mime: string) => INLINE_TYPES.test(mime);
export const isPassiveType = (mime: string) => PASSIVE_TYPES.test(mime);

export function cleanFileName(name: string): string {
  const clean = name.replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').trim();
  return clean.slice(0, 200) || 'file';
}

// "Week 3 slides.pdf" -> "Week 3 slides"
export const titleFromFileName = (name: string) => name.replace(/\.[^.\s]{1,8}$/, '').trim() || name;

// Trust the browser's type when it looks like one, else go by the extension.
export function mimeFor(declared: string | undefined, name: string): string {
  const mime = (declared ?? '').split(';')[0].trim().toLowerCase();
  if (/^[\w.+-]+\/[\w.+-]+$/.test(mime) && mime !== 'application/octet-stream') return mime;
  const extension = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1].toLowerCase();
  return (extension && MIME_BY_EXTENSION[extension]) || 'application/octet-stream';
}

export function kindForMime(mime: string): 'image' | 'video' | 'pdf' | 'file' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  return 'file';
}

export const filePath = (itemId: string, fileId: string) => path.join(config.fileDir, itemId, fileId);

// Streams a request body to disk, stopping as soon as it passes the limit. Returns the size in bytes.
export async function writeUpload(body: ReadableStream<Uint8Array>, target: string, maxBytes: number) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.part`;
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > maxBytes) callback(new HttpError(413, `Files can be up to ${maxBytes / 1024 / 1024} MB`));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as WebReadableStream<Uint8Array>), limit, fs.createWriteStream(partial));
    fs.renameSync(partial, target);
    return size;
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
}

// Removes everything stored on disk for items that are gone for good: uploads and cached previews.
export function clearItemStorage(itemIds: string[]) {
  clearItemImages(itemIds);
  for (const id of itemIds) fs.rmSync(path.join(config.fileDir, id), { recursive: true, force: true });
}
