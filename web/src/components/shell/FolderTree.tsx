import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { NavLink, useParams } from 'react-router';
import { useDragState, type DragData, type DropData } from '@/components/dnd/dnd';
import { FolderGlyph } from '@/components/folders/FolderGlyph';
import { FolderMenuItems } from '@/components/folders/FolderMenu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { childFolders, folderPath } from '@/lib/tree';
import type { Folder } from '@/lib/types';
import { cn } from '@/lib/utils';
import { updateFolder, useStore } from '@/store/store';
import { setExpanded, setMobileNav, useExpanded } from '@/store/ui';

const dropdownParts = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};
const contextParts = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

function FolderNode({ folder, depth, counts }: { folder: Folder; depth: number; counts: Map<string, number> }) {
  const { folderId: activeId } = useParams();
  const children = useStore(useShallow((state) => childFolders(state.folders, folder.id)));
  const expanded = useExpanded((state) => state.ids.includes(folder.id));
  const drop = useDragState((state) => (state.folderDrop?.folderId === folder.id ? state.folderDrop.zone : null));
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dropData: DropData = { type: 'folder', folderId: folder.id };
  const dragData: DragData = { type: 'folder', folderId: folder.id };
  const droppable = useDroppable({ id: `folder:${folder.id}`, data: dropData });
  const draggable = useDraggable({ id: `drag-folder:${folder.id}`, data: dragData });

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const finishRename = (save: boolean) => {
    const title = inputRef.current?.value.trim();
    setRenaming(false);
    if (save && title && title !== folder.title) void updateFolder(folder.id, { title });
  };
  const onRenameKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter') finishRename(true);
    if (event.key === 'Escape') finishRename(false);
  };

  const count = counts.get(folder.id);
  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={(node) => {
              droppable.setNodeRef(node);
              draggable.setNodeRef(node);
            }}
            {...draggable.attributes}
            {...draggable.listeners}
            className={cn(
              'group/row relative flex h-8 items-center rounded-md pr-1 text-sm outline-none',
              activeId === folder.id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                : 'hover:bg-sidebar-accent/60',
              draggable.isDragging && 'opacity-40',
              drop === 'inside' && 'bg-primary/10 ring-primary/40 ring-1'
            )}
            style={{ paddingLeft: 4 + depth * 14 }}
          >
            {drop === 'before' && <span className="bg-primary absolute inset-x-1 -top-px h-0.5 rounded-full" />}
            {drop === 'after' && <span className="bg-primary absolute inset-x-1 -bottom-px h-0.5 rounded-full" />}
            <button
              type="button"
              aria-label={expanded ? 'Collapse' : 'Expand'}
              onClick={() => setExpanded(folder.id, !expanded)}
              className={cn(
                'text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded',
                !children.length && 'invisible'
              )}
            >
              <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
            </button>
            {renaming ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 pl-0.5">
                <FolderGlyph folder={folder} />
                <input
                  ref={inputRef}
                  defaultValue={folder.title}
                  onBlur={() => finishRename(true)}
                  onKeyDown={onRenameKey}
                  onPointerDown={(event) => event.stopPropagation()}
                  className="bg-background min-w-0 flex-1 rounded border px-1 py-0.5 text-sm outline-none"
                  aria-label="Folder name"
                />
              </div>
            ) : (
              <NavLink
                to={`/s/${folder.spaceId}/f/${folder.id}`}
                onClick={() => setMobileNav(false)}
                onDoubleClick={() => setRenaming(true)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-0.5"
                draggable={false}
              >
                <FolderGlyph folder={folder} open={expanded && children.length > 0} />
                <span className="truncate">{folder.title}</span>
              </NavLink>
            )}
            {!renaming && (
              <>
                {count ? (
                  <span className="text-muted-foreground ml-1 text-xs tabular-nums group-hover/row:hidden">
                    {count}
                  </span>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Options for ${folder.title}`}
                      className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent hidden size-6 items-center justify-center rounded group-hover/row:flex aria-expanded:flex"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="right" className="w-52">
                    <FolderMenuItems folder={folder} parts={dropdownParts} onRename={() => setRenaming(true)} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <FolderMenuItems folder={folder} parts={contextParts} onRename={() => setRenaming(true)} />
        </ContextMenuContent>
      </ContextMenu>
      {expanded && children.length > 0 && (
        <ul>
          {children.map((child) => (
            <FolderNode key={child.id} folder={child} depth={depth + 1} counts={counts} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FolderTree({ counts }: { counts: Map<string, number> }) {
  const roots = useStore(useShallow((state) => childFolders(state.folders, null)));
  const { folderId } = useParams();
  const folders = useStore((state) => state.folders);

  // Keep the open folder visible: expand everything above it.
  useEffect(() => {
    if (!folderId) return;
    for (const ancestor of folderPath(folders, folderId).slice(0, -1)) {
      if (!useExpanded.getState().ids.includes(ancestor.id)) setExpanded(ancestor.id, true);
    }
  }, [folderId, folders]);

  return (
    <ul>
      {roots.map((folder) => (
        <FolderNode key={folder.id} folder={folder} depth={0} counts={counts} />
      ))}
    </ul>
  );
}
