import { Inbox } from 'lucide-react';
import { useMemo } from 'react';
import { FolderGlyph } from '@/components/folders/FolderGlyph';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { folderPath, folderStatus } from '@/lib/tree';
import { moveItems, useStore } from '@/store/store';
import { askMoveItems, useUi } from '@/store/ui';

// Type to find a folder by any part of its path, e.g. "ai wk3".
export function MoveDialog() {
  const ids = useUi((state) => state.movingItemIds);
  const folders = useStore((state) => state.folders);
  const options = useMemo(
    () =>
      Object.values(folders)
        .filter((folder) => folderStatus(folders, folder.id) === 'active')
        .map((folder) => ({
          folder,
          path: folderPath(folders, folder.id)
            .map((f) => f.title)
            .join(' / '),
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [folders]
  );

  const move = (folderId: string | null) => {
    if (ids) void moveItems(ids, folderId);
    askMoveItems(null);
  };

  return (
    <CommandDialog
      open={!!ids}
      onOpenChange={(open) => !open && askMoveItems(null)}
      title="Move to folder"
      description="Choose where to move the selected items"
    >
      <Command>
        <CommandInput placeholder={`Move ${ids?.length === 1 ? 'item' : `${ids?.length ?? 0} items`} to…`} />
        <CommandList>
          <CommandEmpty>No folder found.</CommandEmpty>
          <CommandGroup>
            <CommandItem value="inbox" onSelect={() => move(null)}>
              <Inbox /> Inbox
            </CommandItem>
            {options.map(({ folder, path }) => (
              <CommandItem key={folder.id} value={`${path} ${folder.id}`} onSelect={() => move(folder.id)}>
                <FolderGlyph folder={folder} />
                <span className="truncate">{path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
