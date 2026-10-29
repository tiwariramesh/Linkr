import { eq } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { generateNKeysBetween } from 'fractional-indexing';
import { Parser } from 'htmlparser2';
import { nowIso } from '../db/client.ts';
import { folders, items, itemTags, tags } from '../db/schema.ts';
import { mutate, type Change } from '../events.ts';
import { HttpError } from '../http.ts';
import { newId } from './ids.ts';
import { folderPositionAtEnd } from './positions.ts';

type Tx = Parameters<Parameters<typeof mutate>[2]>[0];

type ImportedLink = {
  url: string;
  title: string;
  description?: string;
  notes?: string;
  folderPath: string[]; // relative to the import's root folder
  tags: string[];
  addedAt: string | null;
};

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Writes imported links into a new top-level folder: sub-paths become subfolders and tag names
 * are matched to existing tags (case-insensitive) or created. Returns the root folder's ID.
 */
function writeImport(userId: string, spaceId: string, rootTitle: string, links: ImportedLink[]) {
  return mutate(spaceId, userId, (tx, touch) => {
    const now = nowIso();
    const rootId = newId();
    tx.insert(folders)
      .values({
        id: rootId,
        spaceId,
        title: rootTitle,
        position: folderPositionAtEnd(tx, spaceId, null),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    touch({ entity: 'folder', id: rootId });

    const folderIds = new Map<string, string>([['', rootId]]);
    const folderFor = (path: string[]): string => {
      const key = path.join('\u0000');
      const existing = folderIds.get(key);
      if (existing) return existing;
      const parentId = folderFor(path.slice(0, -1));
      const id = newId();
      tx.insert(folders)
        .values({
          id,
          spaceId,
          parentId,
          title: path[path.length - 1],
          position: folderPositionAtEnd(tx, spaceId, parentId),
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      touch({ entity: 'folder', id });
      folderIds.set(key, id);
      return id;
    };

    const tagIds = tagResolver(tx, spaceId, now, touch);
    const byFolder = new Map<string, ImportedLink[]>();
    for (const link of links) {
      const folderId = folderFor(link.folderPath);
      byFolder.set(folderId, [...(byFolder.get(folderId) ?? []), link]);
    }
    for (const [folderId, folderLinks] of byFolder) {
      const positions = generateNKeysBetween(null, null, folderLinks.length);
      folderLinks.forEach((link, index) => {
        const id = newId();
        tx.insert(items)
          .values({
            id,
            spaceId,
            folderId,
            kind: 'link',
            url: link.url,
            title: link.title || link.url,
            description: link.description ?? '',
            notes: link.notes ?? '',
            position: positions[index],
            createdBy: userId,
            createdAt: link.addedAt ?? now,
            updatedAt: now,
          })
          .run();
        const ids = [...new Set(link.tags.map(tagIds))];
        if (ids.length) {
          tx.insert(itemTags)
            .values(ids.map((tagId) => ({ itemId: id, tagId })))
            .run();
        }
        touch({ entity: 'item', id });
      });
    }
    return rootId;
  });
}

function tagResolver(tx: Tx, spaceId: string, now: string, touch: (c: Change) => void) {
  const known = new Map(
    tx
      .select()
      .from(tags)
      .where(eq(tags.spaceId, spaceId))
      .all()
      .map((tag) => [tag.title.toLowerCase(), tag.id])
  );
  return (title: string) => {
    const key = title.toLowerCase();
    let id = known.get(key);
    if (!id) {
      id = newId();
      tx.insert(tags).values({ id, spaceId, title, createdAt: now, updatedAt: now }).run();
      touch({ entity: 'tag', id });
      known.set(key, id);
    }
    return id;
  };
}

// ---- Browser / Raindrop.io bookmarks (Netscape bookmark HTML) ----

export function parseBookmarkHtml(html: string): { links: ImportedLink[]; skipped: number } {
  const links: ImportedLink[] = [];
  const folderStack: (string | null)[] = [];
  let skipped = 0;
  let pendingFolder: string | null = null;
  let inHeading = false;
  let headingText = '';
  let current: ImportedLink | null = null;

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === 'h3') {
          inHeading = true;
          headingText = '';
        } else if (name === 'dl') {
          // A <DL> right after an <H3> holds that folder's contents.
          folderStack.push(pendingFolder);
          pendingFolder = null;
        } else if (name === 'a') {
          const url = (attrs.href ?? '').trim();
          if (!/^https?:\/\//i.test(url)) {
            skipped++;
            current = null;
            return;
          }
          const seconds = Number(attrs.add_date);
          current = {
            url,
            title: '',
            folderPath: folderStack.filter((folder): folder is string => !!folder),
            tags: (attrs.tags ?? '')
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            addedAt: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null,
          };
        }
      },
      ontext(text) {
        if (inHeading) headingText += text;
        else if (current) current.title += text;
      },
      onclosetag(name) {
        if (name === 'h3') {
          inHeading = false;
          pendingFolder = headingText.trim() || null;
        } else if (name === 'dl') {
          folderStack.pop();
        } else if (name === 'a' && current) {
          current.title = current.title.trim();
          links.push(current);
          current = null;
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
  );
  parser.write(html);
  parser.end();
  return { links, skipped };
}

export function importBookmarkHtml(userId: string, spaceId: string, html: string, sourceName: string) {
  const { links, skipped } = parseBookmarkHtml(html);
  if (links.length === 0) throw new HttpError(422, 'No bookmarks found in the uploaded file');
  const folderId = writeImport(userId, spaceId, `${sourceName} bookmarks · ${today()}`, links);
  return { imported: links.length, skipped, folderId };
}

// ---- Pocket export (.zip with part_*.csv and optional collections/*.json) ----

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

type PocketCollection = {
  title: string;
  items: { url: string; title: string; excerpt?: string; note?: string }[];
};

export function importPocketZip(userId: string, spaceId: string, zip: Uint8Array) {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new HttpError(422, 'Failed to open ZIP archive');
  }
  const names = Object.keys(files);
  const csvNames = names.filter((name) => /(^|\/)part_[^/]*\.csv$/.test(name));
  if (csvNames.length === 0) throw new HttpError(422, 'No CSV files found in the archive');

  // Pocket collections become subfolders; a link in several collections goes into the first.
  type Extra = { title?: string; excerpt?: string; notes: string[]; collection?: string };
  const extras = new Map<string, Extra>();
  for (const name of names.filter((n) => /(^|\/)collections\/[^/]+\.json$/.test(n))) {
    const data = JSON.parse(strFromU8(files[name])) as PocketCollection;
    if (!data?.title || !Array.isArray(data.items)) throw new HttpError(422, `Invalid collection data in ${name}`);
    for (const entry of data.items) {
      const extra: Extra = extras.get(entry.url) ?? { notes: [] };
      extra.title = entry.title;
      extra.excerpt = entry.excerpt ?? '';
      if (entry.note) extra.notes.push(entry.note);
      extra.collection ??= data.title;
      extras.set(entry.url, extra);
    }
  }

  const links: ImportedLink[] = [];
  for (const csvName of csvNames) {
    const [header, ...rows] = parseCsv(strFromU8(files[csvName]));
    if (header?.join(',') !== 'title,url,time_added,tags,status') {
      throw new HttpError(422, `Invalid CSV format in ${csvName}`);
    }
    for (const row of rows) {
      if (row.length !== 5) throw new HttpError(422, `Invalid CSV row in ${csvName}`);
      const [csvTitle, url, timeAdded, tagList, status] = row;
      const extra = extras.get(url);
      const seconds = Number(timeAdded);
      links.push({
        url,
        title: extra?.title && extra.title !== url ? extra.title : csvTitle || url,
        description: extra?.excerpt ?? '',
        notes: extra?.notes.join('\n\n') ?? '',
        folderPath: extra?.collection ? [extra.collection] : [],
        tags: [...tagList.split('|').filter(Boolean), ...(status ? [status] : [])],
        addedAt: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null,
      });
    }
  }
  if (links.length === 0) throw new HttpError(422, 'No bookmarks found in the archive');
  const folderId = writeImport(userId, spaceId, `Pocket · ${today()}`, links);
  return { imported: links.length, folderId };
}
