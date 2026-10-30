import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { SessionUser } from '../auth.ts';
import { db, nowIso } from '../db/client.ts';
import { apiTokens, user } from '../db/schema.ts';
import { newId } from './ids.ts';

// Browser-extension tokens. They act as the user for links, notes and folders, but can't manage
// tokens or the account itself (see requireSession). Only a SHA-256 hash is kept, so a copy of the
// database can't be used to sign in.

const PREFIX = 'lk_';
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export function createToken(userId: string, name: string) {
  const token = PREFIX + crypto.randomBytes(32).toString('base64url');
  const row = { id: newId(), userId, name, tokenHash: hash(token), createdAt: nowIso(), lastUsedAt: null };
  db.insert(apiTokens).values(row).run();
  return { token, info: tokenWire(row) };
}

export const tokenWire = (row: typeof apiTokens.$inferSelect) => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
});

export function listTokens(userId: string) {
  return db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(apiTokens.createdAt)
    .all()
    .map(tokenWire);
}

export function revokeToken(userId: string, id: string) {
  return (
    db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, userId)))
      .run().changes > 0
  );
}

export const bearerToken = (header: string | undefined) =>
  header?.startsWith(`Bearer ${PREFIX}`) ? header.slice('Bearer '.length) : null;

// The user a token belongs to, or null. Records when it was last used, at most once a minute.
export function userForToken(token: string): SessionUser | null {
  const row = db
    .select({ token: apiTokens, user })
    .from(apiTokens)
    .innerJoin(user, eq(user.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hash(token)))
    .get();
  if (!row) return null;
  const now = Date.now();
  if (!row.token.lastUsedAt || now - Date.parse(row.token.lastUsedAt) > 60_000) {
    db.update(apiTokens).set({ lastUsedAt: nowIso() }).where(eq(apiTokens.id, row.token.id)).run();
  }
  return row.user as SessionUser;
}
