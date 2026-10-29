import { unzipSync, strFromU8 } from 'fflate';
import { Parser } from 'htmlparser2';
import { HttpError } from '../http.ts';
import { createItems, createTagsFromSegments, getTagRows, createTag, type NewItem } from './repo.ts';

// ---- Browser / Raindrop.io bookmarks (Netscape bookmark HTML) ----

type Bookmark = { url: string; title: string; folders: string[]; tags: string[]; addedAt: string | null };

function parseBookmarkHtml(html: string): { bookmarks: Bookmark[]; skipped: number } {
  const bookmarks: Bookmark[] = [];
  const folderStack: (string | null)[] = [];
  let skipped = 0;
  let pendingFolder: string | null = null;
  let inHeading = false;
  let headingText = '';
  let current: Bookmark | null = null;

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
          if (!url || url.toLowerCase().startsWith('javascript:') || url.toLowerCase().startsWith('place:')) {
            skipped++;
            current = null;
            return;
          }
          const seconds = Number(attrs.add_date);
          current = {
            url,
            title: '',
            folders: folderStack.filter((folder): folder is string => !!folder),
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
          bookmarks.push(current);
          current = null;
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true }
  );
  parser.write(html);
  parser.end();
  return { bookmarks, skipped };
}

export function importBookmarkHtml(userId: string, html: string, sourceName: string) {
  const { bookmarks, skipped } = parseBookmarkHtml(html);
  if (bookmarks.length === 0) throw new HttpError(422, 'No bookmarks found in the uploaded file');

  const description = `Tag imported from ${sourceName}`;
  const pathCache = new Map<string, number>();
  const tagFor = (segments: string[]) => {
    const key = JSON.stringify(segments.map((segment) => segment.toLowerCase()));
    let id = pathCache.get(key);
    if (id === undefined) {
      id = createTagsFromSegments(userId, segments, description);
      pathCache.set(key, id);
    }
    return id;
  };
  const defaultTag = tagFor([`Imported from ${sourceName}`]);

  const newItems: NewItem[] = bookmarks.map((bookmark) => {
    const tagIds = new Set([defaultTag]);
    if (bookmark.folders.length > 0) tagIds.add(tagFor(bookmark.folders));
    for (const tag of bookmark.tags) tagIds.add(tagFor([tag]));
    return {
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
      tagIds: [...tagIds],
      createdAt: bookmark.addedAt ?? undefined,
    };
  });
  createItems(userId, newItems);
  return { imported: newItems.length, skipped };
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
  description?: string;
  items: { url: string; title: string; excerpt?: string; note?: string }[];
};

export function importPocketZip(userId: string, zip: Uint8Array) {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new HttpError(422, 'Failed to open ZIP archive');
  }
  const names = Object.keys(files);
  const csvNames = names.filter((name) => /(^|\/)part_[^/]*\.csv$/.test(name));
  if (csvNames.length === 0) throw new HttpError(422, 'No CSV files found in the archive');

  // Notes, excerpts and collection membership come from the collections folder.
  type CollectionInfo = { title?: string; excerpt?: string; notes: Map<string, string>; collections: string[] };
  const collectionInfo = new Map<string, CollectionInfo>();
  const collections = new Map<string, string>();
  for (const name of names.filter((n) => /(^|\/)collections\/[^/]+\.json$/.test(n))) {
    const data = JSON.parse(strFromU8(files[name])) as PocketCollection;
    if (!data?.title || !Array.isArray(data.items)) throw new HttpError(422, `Invalid collection data in ${name}`);
    collections.set(data.title, data.description ?? '');
    for (const entry of data.items) {
      const info: CollectionInfo = collectionInfo.get(entry.url) ?? { notes: new Map(), collections: [] };
      info.title = entry.title;
      info.excerpt = entry.excerpt ?? '';
      if (entry.note) info.notes.set(data.title, entry.note);
      info.collections.push(data.title);
      collectionInfo.set(entry.url, info);
    }
  }

  // Tags directly under `parent`, matched case-insensitively and created when missing.
  const existing = getTagRows(userId);
  const tagUnder = (title: string, parent: number, description: string) => {
    const match = existing.find((tag) => tag.parent === parent && tag.title.toLowerCase() === title.toLowerCase());
    if (match) return match.id;
    const id = createTag(userId, title, description, parent);
    existing.push({ id, title, parent } as (typeof existing)[number]);
    return id;
  };

  const newItems: NewItem[] = [];
  let statusParent: number | null = null;
  let collectionsParent: number | null = null;
  for (const csvName of csvNames) {
    const [header, ...rows] = parseCsv(strFromU8(files[csvName]));
    if (header?.join(',') !== 'title,url,time_added,tags,status') {
      throw new HttpError(422, `Invalid CSV format in ${csvName}`);
    }
    for (const row of rows) {
      if (row.length !== 5) throw new HttpError(422, `Invalid CSV row in ${csvName}`);
      const [csvTitle, url, timeAdded, tagList, status] = row;
      const info = collectionInfo.get(url);
      const tagIds = new Set<number>();
      for (const tag of [...tagList.split('|').filter(Boolean), 'Imported from Pocket']) {
        tagIds.add(tagUnder(tag, 0, 'Tag imported from Pocket'));
      }
      if (status) {
        statusParent ??= tagUnder('Status', 0, 'Pocket read status: unread or archive');
        tagIds.add(tagUnder(status, statusParent, ''));
      }
      for (const collection of info?.collections ?? []) {
        collectionsParent ??= tagUnder('Collections', 0, 'Pocket collections');
        tagIds.add(tagUnder(collection, collectionsParent, collections.get(collection) ?? ''));
      }
      const notes = [...(info?.notes ?? new Map<string, string>())];
      const comments =
        notes.length === 1
          ? notes[0][1]
          : notes.map(([collection, note]) => `Note from Pocket collection "${collection}":\n${note}`).join('\n\n');
      const seconds = Number(timeAdded);
      newItems.push({
        url,
        title: info?.title && info.title !== url ? info.title : csvTitle || url,
        description: info?.excerpt ?? '',
        comments,
        tagIds: [...tagIds],
        createdAt: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined,
      });
    }
  }
  if (newItems.length === 0) throw new HttpError(422, 'No bookmarks found in the archive');
  createItems(userId, newItems);
  return newItems.length;
}
