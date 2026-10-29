import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { generateNKeysBetween } from 'fractional-indexing';
import { config } from '../config.ts';
import * as schema from './schema.ts';

const sqlite = new Database(config.dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;

// Applies any pending migrations, so upgrading is just "pull and restart".
export function migrateDatabase() {
  migrate(db, { migrationsFolder: config.migrationsDir });
  backfillPositions();
}

// Migrated rows arrive without ordering keys. Give each group (one folder's items, one parent's
// subfolders) keys in a sensible default order: newest items first, folders oldest first.
function backfillPositions() {
  const groups = [
    { table: 'items', group: 'space_id, folder_id', order: 'created_at DESC' },
    { table: 'folders', group: 'space_id, parent_id', order: 'created_at ASC' },
  ];
  for (const { table, group, order } of groups) {
    const rows = sqlite
      .prepare(`SELECT id, ${group} FROM ${table} WHERE position = '' ORDER BY ${group}, ${order}`)
      .all() as Record<string, string | null>[];
    if (rows.length === 0) continue;
    const update = sqlite.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
    const byGroup = new Map<string, string[]>();
    for (const row of rows) {
      const key = group
        .split(', ')
        .map((column) => row[column] ?? '')
        .join('|');
      byGroup.set(key, [...(byGroup.get(key) ?? []), row.id as string]);
    }
    sqlite.transaction(() => {
      for (const ids of byGroup.values()) {
        const keys = generateNKeysBetween(null, null, ids.length);
        ids.forEach((id, index) => update.run(keys[index], id));
      }
    })();
  }
}

export const nowIso = () => new Date().toISOString();
