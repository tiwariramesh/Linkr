import { CalendarDays, ChevronLeft, Folder as FolderIcon, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { canSaveTo, folderPath, formatDate, today, type Folder, type LinkrState, type Target } from '../lib/linkr.ts';

// A searchable list of every place to save into (or open from), grouped by space. Today's sessions
// come first. `mode`: "save" offers each space's Inbox; "parent" offers its top level instead;
// "open" lists folders only, including spaces the user can only view.

type Mode = 'save' | 'parent' | 'open';

// Folders in tree order (parents before children), with their depth.
function tree(folders: Folder[]) {
  const children = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const list = children.get(folder.parentId) ?? [];
    list.push(folder);
    children.set(folder.parentId, list);
  }
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of (children.get(parentId) ?? []).sort((a, b) => (a.position < b.position ? -1 : 1))) {
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function FolderPicker({
  state,
  mode,
  title,
  onPick,
  onBack,
}: {
  state: LinkrState;
  mode: Mode;
  title: string;
  onPick: (target: Target) => void;
  onBack: () => void;
}) {
  const spaces = state.spaces.filter((space) => mode === 'open' || canSaveTo(state, space.id));
  const todays = state.folders.filter(
    (folder) => folder.sessionDate === today() && spaces.some((space) => space.id === folder.spaceId)
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-2 pt-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ChevronLeft />
        </Button>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <Command className="flex-1 bg-transparent" loop>
        <CommandInput placeholder="Search folders" autoFocus />
        <CommandList className="max-h-none flex-1">
          <CommandEmpty>No folders match.</CommandEmpty>
          {todays.length > 0 && (
            <CommandGroup heading="Today">
              {todays.map((folder) => (
                <CommandItem
                  key={'today-' + folder.id}
                  value={`today ${folderPath(state, folder.id)} ${folder.id}`}
                  onSelect={() => onPick({ spaceId: folder.spaceId, folderId: folder.id })}
                >
                  <CalendarDays className="text-primary" />
                  <span className="truncate">{folderPath(state, folder.id)}</span>
                  {folder.term && <span className="text-muted-foreground ml-auto text-xs">{folder.term}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {spaces.map((space) => (
            <CommandGroup key={space.id} heading={space.name}>
              {mode !== 'open' && (
                <CommandItem
                  value={`${space.name} ${mode === 'save' ? 'inbox' : 'top level'} ${space.id}`}
                  onSelect={() => onPick({ spaceId: space.id, folderId: null })}
                >
                  <Inbox />
                  {mode === 'save' ? 'Inbox' : 'Top level'}
                </CommandItem>
              )}
              {tree(state.folders.filter((folder) => folder.spaceId === space.id)).map(({ folder, depth }) => (
                <CommandItem
                  key={folder.id}
                  value={`${folderPath(state, folder.id)} ${space.name} ${folder.id}`}
                  onSelect={() => onPick({ spaceId: space.id, folderId: folder.id })}
                >
                  <span style={{ width: depth * 12 }} className="shrink-0" />
                  {folder.icon ? <span className="w-4 text-center">{folder.icon}</span> : <FolderIcon />}
                  <span className="truncate">{folder.title}</span>
                  {folder.sessionDate && (
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {formatDate(folder.sessionDate)}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}
