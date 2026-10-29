import { db, nowIso } from './db/client.ts';
import { changes } from './db/schema.ts';
import { memberIds } from './lib/access.ts';

// Every write records which rows it touched in the `changes` log, then pings the space's members.
// Their devices fetch everything after the last sequence number they saw.

export type Entity = 'space' | 'folder' | 'item' | 'tag' | 'highlight';
export type Change = { entity: Entity; id: string; op?: 'upsert' | 'delete' };
export type SpaceEvent = { spaceId: string; seq: number };

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Listener = (event: SpaceEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(userId: string, listener: Listener) {
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(userId);
  };
}

export function notifySpace(spaceId: string, seq: number) {
  for (const userId of memberIds(spaceId)) {
    for (const listener of listeners.get(userId) ?? []) listener({ spaceId, seq });
  }
}

/**
 * Runs `work` in a transaction and logs the rows it reports through `touch`.
 * Returns whatever `work` returns.
 */
export function mutate<T>(spaceId: string, actorId: string | null, work: (tx: Tx, touch: (c: Change) => void) => T): T {
  let lastSeq = 0;
  const result = db.transaction((tx) => {
    const touched: Change[] = [];
    const value = work(tx, (change) => touched.push(change));
    const at = nowIso();
    for (const change of touched) {
      const row = tx
        .insert(changes)
        .values({ spaceId, entity: change.entity, entityId: change.id, op: change.op ?? 'upsert', actorId, at })
        .returning({ seq: changes.seq })
        .get();
      lastSeq = row.seq;
    }
    return value;
  });
  if (lastSeq > 0) notifySpace(spaceId, lastSeq);
  return result;
}
