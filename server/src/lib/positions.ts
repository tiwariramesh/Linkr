import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { db } from '../db/client.ts';
import { folders, items } from '../db/schema.ts';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const inFolder = (spaceId: string, folderId: string | null) =>
  and(eq(items.spaceId, spaceId), folderId ? eq(items.folderId, folderId) : isNull(items.folderId));

const underParent = (spaceId: string, parentId: string | null) =>
  and(eq(folders.spaceId, spaceId), parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId));

// New items go to the top of their folder.
export function itemPositionsAtTop(tx: Tx, spaceId: string, folderId: string | null, count: number): string[] {
  const first = tx
    .select({ position: items.position })
    .from(items)
    .where(inFolder(spaceId, folderId))
    .orderBy(asc(items.position))
    .limit(1)
    .get();
  return generateNKeysBetween(null, first?.position || null, count);
}

// New folders go to the bottom of their parent, like a sidebar list.
export function folderPositionAtEnd(tx: Tx, spaceId: string, parentId: string | null): string {
  const last = tx
    .select({ position: folders.position })
    .from(folders)
    .where(underParent(spaceId, parentId))
    .orderBy(desc(folders.position))
    .limit(1)
    .get();
  return generateKeyBetween(last?.position || null, null);
}

// Client-supplied keys must be valid fractional-index keys; anything else falls back to a server-chosen one.
export function isValidPosition(position: string): boolean {
  try {
    generateKeyBetween(position, null);
    return true;
  } catch {
    return false;
  }
}
