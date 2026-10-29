import crypto from 'node:crypto';
import { z } from 'zod';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// 16 base62 characters (~95 bits). Clients generate IDs the same way so they can show new rows instantly.
export function newId(): string {
  const bytes = crypto.randomBytes(16);
  let id = '';
  for (const byte of bytes) id += ALPHABET[byte % 62];
  return id;
}

export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid ID');

// A rich-text document from the notes editor, stored as its JSON text: { type: 'blocks', blocks } from the
// block editor, or { type: 'doc', ... } from the editor notes were written in before it.
export const documentSchema = z
  .string()
  .max(2_000_000, 'This note is too long')
  .refine((value) => {
    try {
      const type = JSON.parse(value)?.type;
      return type === 'blocks' || type === 'doc';
    } catch {
      return false;
    }
  }, 'Not an editor document');
