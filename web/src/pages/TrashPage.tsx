import { Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FolderGlyph } from '@/components/folders/FolderGlyph';
import { Favicon } from '@/components/items/ItemParts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { timeAgo } from '@/lib/format';
import { folderStatus } from '@/lib/tree';
import { purgeFolder, purgeItems, restoreFolder, restoreItems, useStore } from '@/store/store';

export function TrashPage() {
  const folders = useStore((state) => state.folders);
  const items = useStore((state) => state.items);
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  // Trashed folders, plus trashed items that aren't already inside a trashed folder.
  const trashedFolders = useMemo(
    () =>
      Object.values(folders)
        .filter(
          (folder) => folder.deletedAt && (!folder.parentId || folderStatus(folders, folder.parentId) !== 'trashed')
        )
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [folders]
  );
  const trashedItems = useMemo(
    () =>
      Object.values(items)
        .filter((item) => item.deletedAt && (!item.folderId || folderStatus(folders, item.folderId) !== 'trashed'))
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [items, folders]
  );

  const emptyTrash = async () => {
    setConfirmEmpty(false);
    await purgeItems(trashedItems.map((item) => item.id));
    for (const folder of trashedFolders) await purgeFolder(folder.id);
  };

  const isEmpty = trashedFolders.length === 0 && trashedItems.length === 0;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="bg-muted flex size-11 items-center justify-center rounded-xl">
            <Trash2 className="size-5" />
          </span>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Trash</h1>
            <p className="text-muted-foreground text-sm">Items here are deleted for good after 30 days.</p>
          </div>
          {!isEmpty && (
            <Button variant="destructive" onClick={() => setConfirmEmpty(true)}>
              Empty Trash
            </Button>
          )}
        </div>

        {isEmpty && (
          <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
            The Trash is empty.
          </div>
        )}

        <div className="flex flex-col divide-y rounded-xl border empty:hidden">
          {trashedFolders.map((folder) => (
            <div key={folder.id} className="flex items-center gap-3 px-3 py-2.5">
              <FolderGlyph folder={folder} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{folder.title}</p>
                <p className="text-muted-foreground text-xs">Folder · deleted {timeAgo(folder.deletedAt!)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => restoreFolder(folder.id)}>
                <Undo2 /> Restore
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => purgeFolder(folder.id)}>
                Delete forever
              </Button>
            </div>
          ))}
          {trashedItems.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5">
              <Favicon item={item} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-muted-foreground text-xs">Deleted {timeAgo(item.deletedAt!)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => restoreItems([item.id])}>
                <Undo2 /> Restore
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => purgeItems([item.id])}>
                Delete forever
              </Button>
            </div>
          ))}
        </div>
      </div>
      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty the Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything in the Trash, including folders and their contents, will be deleted for good on every device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={emptyTrash}>
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
