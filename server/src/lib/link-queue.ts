import { eq } from 'drizzle-orm';
import { db, nowIso } from '../db/client.ts';
import { itemContent, items } from '../db/schema.ts';
import { mutate, type Tx } from '../events.ts';
import { clearItemImages } from './images.ts';
import { fetchLinkMetadata, type LinkMetadata } from './metadata.ts';

// Saving a link returns at once; its title, image and kind are filled in here, then pushed to every device.

const CONCURRENCY = 4;
const queue: string[] = [];
const overwrite = new Set<string>();
let running = 0;

// What a link is called until its real title arrives.
export function placeholderTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// `refresh` replaces title, description and image even if they were set (the user asked to refetch).
export function enqueueFetch(itemId: string, refresh = false) {
  if (refresh) overwrite.add(itemId);
  if (!queue.includes(itemId)) queue.push(itemId);
  pump();
}

function pump() {
  while (running < CONCURRENCY && queue.length > 0) {
    const itemId = queue.shift()!;
    running++;
    process(itemId).finally(() => {
      running--;
      pump();
    });
  }
}

// The reader copy is replaced on every fetch; a page without one keeps none.
function saveReaderCopy(tx: Tx, itemId: string, meta: LinkMetadata) {
  if (!meta.article) {
    tx.delete(itemContent).where(eq(itemContent.itemId, itemId)).run();
    return;
  }
  const row = { ...meta.article, fetchedAt: nowIso() };
  tx.insert(itemContent)
    .values({ itemId, ...row })
    .onConflictDoUpdate({ target: itemContent.itemId, set: row })
    .run();
}

// Fetches a page again just for its reader copy and framing rule (links saved before reader copies existed).
export async function fetchReaderCopy(itemId: string) {
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  if (!item?.url) return;
  const meta = await fetchLinkMetadata(item.url);
  mutate(item.spaceId, null, (tx, touch) => {
    const current = tx.select().from(items).where(eq(items.id, itemId)).get();
    if (!current || current.url !== item.url) return;
    tx.update(items).set({ frameable: meta.frameable, updatedAt: nowIso() }).where(eq(items.id, itemId)).run();
    saveReaderCopy(tx, itemId, meta);
    touch({ entity: 'item', id: itemId });
  });
}

async function process(itemId: string) {
  const item = db.select().from(items).where(eq(items.id, itemId)).get();
  const refresh = overwrite.delete(itemId);
  if (!item || !item.url) return;
  try {
    const meta = await fetchLinkMetadata(item.url);
    mutate(item.spaceId, null, (tx, touch) => {
      const current = tx.select().from(items).where(eq(items.id, itemId)).get();
      if (!current || current.url !== item.url) return; // edited meanwhile; a newer fetch is queued
      const keepTitle = !refresh && current.title !== placeholderTitle(current.url);
      tx.update(items)
        .set({
          kind: current.kind === 'link' || refresh ? meta.kind : current.kind,
          title: keepTitle ? current.title : (meta.title ?? current.title),
          description: !refresh && current.description ? current.description : (meta.description ?? ''),
          image: !refresh && current.image ? current.image : (meta.image ?? ''),
          favicon: meta.favicon ?? '',
          siteName: meta.siteName,
          frameable: meta.frameable,
          fetchStatus: 'done',
          updatedAt: nowIso(),
        })
        .where(eq(items.id, itemId))
        .run();
      saveReaderCopy(tx, itemId, meta);
      touch({ entity: 'item', id: itemId });
    });
    if (refresh) clearItemImages([itemId]);
  } catch {
    mutate(item.spaceId, null, (tx, touch) => {
      tx.update(items).set({ fetchStatus: 'failed', updatedAt: nowIso() }).where(eq(items.id, itemId)).run();
      touch({ entity: 'item', id: itemId });
    });
  }
}

// Fetches interrupted by a restart are picked up again.
export function resumePendingFetches() {
  const pending = db.select({ id: items.id }).from(items).where(eq(items.fetchStatus, 'pending')).all();
  for (const row of pending) enqueueFetch(row.id);
}
