import type { Context } from 'hono';

// In-process pub/sub that pushes "something changed" to every open device of a user.

export type SyncEntity = 'items' | 'tags';

export type SyncEvent = {
  entities: SyncEntity[];
  // Client ID of the tab that made the change, so it can skip refetching its own edit.
  source: string | null;
};

type Listener = (event: SyncEvent) => void;

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

// Each browser tab sends a random ID with its requests.
export const clientIdOf = (c: Context) => c.req.header('x-linkr-client')?.slice(0, 64) ?? null;

export function publish(userId: string, entities: SyncEntity[], source: string | null) {
  for (const listener of listeners.get(userId) ?? []) {
    listener({ entities, source });
  }
}
