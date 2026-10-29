import { and, inArray, isNotNull, lt } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { folders, items } from '../db/schema.ts';
import { mutate } from '../events.ts';
import { purgeFolders } from '../routes/folders.ts';
import { clearItemImages } from './images.ts';

const TRASH_DAYS = 30;

// Empties anything that has been in the Trash for more than 30 days.
export function purgeOldTrash() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const oldFolders = db
    .select({ id: folders.id, spaceId: folders.spaceId })
    .from(folders)
    .where(and(isNotNull(folders.deletedAt), lt(folders.deletedAt, cutoff)))
    .all();
  for (const folder of oldFolders) purgeFolders(folder.spaceId, null, [folder.id]);

  const oldItems = db
    .select({ id: items.id, spaceId: items.spaceId })
    .from(items)
    .where(and(isNotNull(items.deletedAt), lt(items.deletedAt, cutoff)))
    .all();
  const bySpace = new Map<string, string[]>();
  for (const item of oldItems) bySpace.set(item.spaceId, [...(bySpace.get(item.spaceId) ?? []), item.id]);
  for (const [spaceId, ids] of bySpace) {
    mutate(spaceId, null, (tx, touch) => {
      tx.delete(items).where(inArray(items.id, ids)).run();
      ids.forEach((id) => touch({ entity: 'item', id, op: 'delete' }));
    });
    clearItemImages(ids);
  }
}
