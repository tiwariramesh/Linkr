export type SyncEntity = 'items' | 'tags';

// Identifies this tab, so changes it made itself aren't fetched twice.
export const clientId = crypto.randomUUID();

/**
 * Keeps one Server-Sent Events stream open while signed in. When another device or tab
 * changes data, the server sends `change` and we refetch what changed. After a dropped
 * connection (sleep, network switch) we refetch everything, since events may have been missed.
 */
export class SyncConnection {
  private source: EventSource | null = null;
  private pending = new Set<SyncEntity>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private hasConnected = false;

  constructor(private onChange: (entities: SyncEntity[]) => void) {}

  start() {
    if (this.source) return;
    this.hasConnected = false;
    const source = new EventSource('/api/events');
    source.addEventListener('ready', () => {
      if (this.hasConnected) this.queue(['items', 'tags']);
      this.hasConnected = true;
    });
    source.addEventListener('change', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { entities: SyncEntity[]; source: string | null };
      if (data.source !== clientId) this.queue(data.entities);
    });
    this.source = source;
  }

  stop() {
    this.source?.close();
    this.source = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }

  // Bulk edits fire several events in a row; collapse them into one refetch.
  private queue(entities: SyncEntity[]) {
    entities.forEach((entity) => this.pending.add(entity));
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const batch = [...this.pending];
      this.pending.clear();
      this.onChange(batch);
    }, 150);
  }
}
