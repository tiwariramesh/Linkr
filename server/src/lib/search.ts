import { db } from '../db/client.ts';

// Full-text search over a space: item titles, links and notes; reader copies; highlights; folder
// titles, terms and session notes. The FTS5 indexes and their triggers are in migration 0005.

export type SearchHit = {
  type: 'item' | 'folder';
  id: string;
  // Where the words were found.
  field: 'title' | 'notes' | 'page' | 'highlight' | 'session';
  // Text around the match; \u0002 and \u0003 surround the matched words.
  snippet: string;
};

const START = '\u0002';
const END = '\u0003';
const MAX_RESULTS = 25;

// Plain words only (FTS5 query syntax is never passed through), each matched as a prefix, all required.
export function ftsQuery(text: string): string | null {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length
    ? words
        .slice(0, 8)
        .map((word) => `"${word}"*`)
        .join(' ')
    : null;
}

const snippet = (table: string, column: number) => `snippet(${table}, ${column}, '${START}', '${END}', '…', 14)`;

// Each source is searched separately (an FTS5 MATCH needs its own table), then merged by rank.
// Title matches weigh most. Items and folders in the Trash are left out. `titled` is the title with
// matches marked, which tells a title match from a match in the text.
const SQL = `
  SELECT * FROM (
    SELECT 'item' AS type, i.id, ${snippet('items_fts', -1)} AS snippet,
           highlight(items_fts, 0, '${START}', '${END}') AS titled, 'notes' AS field, bm25(items_fts, 8.0, 1.0) AS rank
      FROM items_fts JOIN items i ON i.rowid = items_fts.rowid
     WHERE items_fts MATCH @q AND i.space_id = @space AND i.deleted_at IS NULL
    UNION ALL
    SELECT 'item', i.id, ${snippet('content_fts', 0)}, NULL, 'page', bm25(content_fts) * 0.6
      FROM content_fts JOIN item_content c ON c.rowid = content_fts.rowid JOIN items i ON i.id = c.item_id
     WHERE content_fts MATCH @q AND i.space_id = @space AND i.deleted_at IS NULL
    UNION ALL
    SELECT 'item', i.id, ${snippet('highlights_fts', 0)}, NULL, 'highlight', bm25(highlights_fts) * 1.5
      FROM highlights_fts JOIN highlights h ON h.rowid = highlights_fts.rowid JOIN items i ON i.id = h.item_id
     WHERE highlights_fts MATCH @q AND i.space_id = @space AND i.deleted_at IS NULL
    UNION ALL
    SELECT 'folder', f.id, ${snippet('folders_fts', -1)}, highlight(folders_fts, 0, '${START}', '${END}'), 'session',
           bm25(folders_fts, 8.0, 1.0)
      FROM folders_fts JOIN folders f ON f.rowid = folders_fts.rowid
     WHERE folders_fts MATCH @q AND f.space_id = @space AND f.deleted_at IS NULL
  )
  ORDER BY rank
  LIMIT 200
`;

type Row = Omit<SearchHit, 'field'> & { field: SearchHit['field']; titled: string | null };

// Prepared on first use: the tables only exist once migrations have run.
let statement: ReturnType<typeof db.$client.prepare> | null = null;

// The best match for each item or folder, best first.
export function searchSpace(spaceId: string, text: string): SearchHit[] {
  const q = ftsQuery(text);
  if (!q) return [];
  statement ??= db.$client.prepare(SQL);
  const rows = statement.all({ q, space: spaceId }) as Row[];
  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const row of rows) {
    const key = `${row.type}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const field = row.titled?.includes(START) ? 'title' : row.field;
    hits.push({ type: row.type, id: row.id, field, snippet: row.snippet });
    if (hits.length === MAX_RESULTS) break;
  }
  return hits;
}
