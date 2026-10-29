import fs from 'node:fs';
import path from 'node:path';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import { config } from '../config.ts';
import { db, nowIso } from '../db/client.ts';
import { files, folders, highlights, itemContent, items, itemTags } from '../db/schema.ts';
import { mutate, type Tx } from '../events.ts';
import { HttpError } from '../http.ts';
import { copyCover } from './covers.ts';
import { clearItemStorage, filePath } from './files.ts';
import { newId } from './ids.ts';
import { enqueueFetch } from './link-queue.ts';
import { folderPositionAtEnd } from './positions.ts';

export type RunAgainOptions = {
  title: string;
  sessionDate: string | null;
  term: string | null;
  // Where the copy goes (null = top level). The original's parent if not given.
  parentId?: string | null;
  // Copy subfolders too (a whole course rather than one session).
  subfolders: boolean;
  // Copy session notes and item notes; otherwise the copy starts with blank notes.
  notes: boolean;
  highlights: boolean;
};

// A position key between `folder` and the sibling after it.
function positionAfter(tx: Tx, folder: typeof folders.$inferSelect) {
  const next = tx
    .select({ position: folders.position })
    .from(folders)
    .where(
      and(
        eq(folders.spaceId, folder.spaceId),
        folder.parentId ? eq(folders.parentId, folder.parentId) : isNull(folders.parentId),
        gt(folders.position, folder.position)
      )
    )
    .orderBy(asc(folders.position))
    .limit(1)
    .get();
  return generateKeyBetween(folder.position, next?.position ?? null);
}

// Folders below `rootId`, parents before children, leaving out any in the Trash.
function liveSubtree(rootId: string, withChildren: boolean) {
  const rows = [db.select().from(folders).where(eq(folders.id, rootId)).get()!];
  if (!withChildren) return rows;
  for (let i = 0; i < rows.length; i++) {
    rows.push(
      ...db
        .select()
        .from(folders)
        .where(and(eq(folders.parentId, rows[i].id), isNull(folders.deletedAt)))
        .all()
    );
  }
  return rows;
}

/**
 * "Run again": copies a session folder for a new date or term. Links, notes, files (their bytes too),
 * reader copies, tags and optionally highlights come along; each copied folder records its original
 * in `copiedFrom`, so history can be traced across terms. Returns the new folder's ID.
 */
export function runAgain(sourceId: string, actorId: string, options: RunAgainOptions): string {
  const source = db.select().from(folders).where(eq(folders.id, sourceId)).get();
  if (!source) throw new HttpError(404, 'Folder not found');
  const spaceId = source.spaceId;
  const tree = liveSubtree(source.id, options.subfolders);
  const parentId = options.parentId === undefined ? source.parentId : options.parentId;
  if (parentId && tree.some((folder) => folder.id === parentId)) {
    throw new HttpError(422, 'A folder can’t be copied into itself');
  }

  const folderIds = new Map(tree.map((folder) => [folder.id, newId()]));
  const sourceItems = db
    .select()
    .from(items)
    .where(and(inArray(items.folderId, [...folderIds.keys()]), isNull(items.deletedAt)))
    .all();
  const itemIds = new Map(sourceItems.map((item) => [item.id, newId()]));
  const oldItemIds = [...itemIds.keys()];
  const sourceFiles = sourceItems.flatMap((item) =>
    item.fileId ? db.select().from(files).where(eq(files.id, item.fileId)).all() : []
  );
  const fileIds = new Map(sourceFiles.map((file) => [file.id, newId()]));

  // Bytes first: if the database write then fails, the copies are removed again.
  const newItemIds = [...itemIds.values()];
  try {
    for (const file of sourceFiles) {
      const target = filePath(itemIds.get(file.itemId)!, fileIds.get(file.id)!);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(filePath(file.itemId, file.id), target);
    }
    for (const [oldId, newItemId] of itemIds) {
      const cached = path.join(config.imageDir, oldId);
      if (fs.existsSync(cached)) fs.cpSync(cached, path.join(config.imageDir, newItemId), { recursive: true });
    }
  } catch {
    clearItemStorage(newItemIds);
    throw new HttpError(500, 'Couldn’t copy the files in this folder');
  }

  const now = nowIso();
  try {
    mutate(spaceId, actorId, (tx, touch) => {
      for (const folder of tree) {
        const isRoot = folder.id === source.id;
        // The copy sits right after the original when it stays beside it; otherwise at the end.
        const position = !isRoot
          ? folder.position
          : parentId === source.parentId
            ? positionAfter(tx, source)
            : folderPositionAtEnd(tx, spaceId, parentId);
        tx.insert(folders)
          .values({
            id: folderIds.get(folder.id)!,
            spaceId,
            parentId: isRoot ? parentId : folderIds.get(folder.parentId!)!,
            title: isRoot ? options.title : folder.title,
            description: folder.description,
            cover: folder.cover,
            icon: folder.icon,
            color: folder.color,
            position,
            // Subfolder dates belong to the old run; their term follows the new one.
            sessionDate: isRoot ? options.sessionDate : null,
            term: isRoot ? options.term : folder.term ? options.term : null,
            view: folder.view,
            body: options.notes ? folder.body : null,
            notes: options.notes ? folder.notes : '',
            copiedFrom: folder.id,
            createdBy: actorId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        touch({ entity: 'folder', id: folderIds.get(folder.id)! });
      }

      for (const item of sourceItems) {
        const id = itemIds.get(item.id)!;
        tx.insert(items)
          .values({
            ...item,
            id,
            folderId: folderIds.get(item.folderId!)!,
            // A note's text is its content, not notes about it, so it always comes along.
            notes: options.notes || item.kind === 'note' ? item.notes : '',
            body: options.notes || item.kind === 'note' ? item.body : null,
            fileId: item.fileId ? fileIds.get(item.fileId)! : null,
            createdBy: actorId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        touch({ entity: 'item', id });
      }
      for (const file of sourceFiles) {
        tx.insert(files)
          .values({
            ...file,
            id: fileIds.get(file.id)!,
            itemId: itemIds.get(file.itemId)!,
            createdBy: actorId,
            createdAt: now,
          })
          .run();
      }
      if (oldItemIds.length) {
        for (const content of tx.select().from(itemContent).where(inArray(itemContent.itemId, oldItemIds)).all()) {
          tx.insert(itemContent)
            .values({ ...content, itemId: itemIds.get(content.itemId)! })
            .run();
        }
        for (const tag of tx.select().from(itemTags).where(inArray(itemTags.itemId, oldItemIds)).all()) {
          tx.insert(itemTags)
            .values({ itemId: itemIds.get(tag.itemId)!, tagId: tag.tagId })
            .run();
        }
        if (options.highlights) {
          for (const highlight of tx.select().from(highlights).where(inArray(highlights.itemId, oldItemIds)).all()) {
            const id = newId();
            tx.insert(highlights)
              .values({
                ...highlight,
                id,
                itemId: itemIds.get(highlight.itemId)!,
                createdBy: actorId,
                createdAt: now,
                updatedAt: now,
              })
              .run();
            touch({ entity: 'highlight', id });
          }
        }
      }
    });
  } catch (error) {
    clearItemStorage(newItemIds);
    throw error;
  }

  for (const folder of tree) {
    if (folder.cover?.startsWith('upload:')) copyCover(spaceId, folder.id, folderIds.get(folder.id)!);
  }

  // Links whose preview was still loading in the original get their own fetch.
  for (const item of sourceItems) if (item.fetchStatus === 'pending') enqueueFetch(itemIds.get(item.id)!);
  return folderIds.get(source.id)!;
}
