import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
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
}

export const nowIso = () => new Date().toISOString();
