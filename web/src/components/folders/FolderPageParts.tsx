import { useDroppable } from '@dnd-kit/core';
import { CalendarDays, CornerDownLeft, FolderInput, FolderPlus, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useDragState, type DropData } from '@/components/dnd/dnd';
import { FolderGlyph } from '@/components/folders/FolderGlyph';
import { Button } from '@/components/ui/button';
import { COLORS } from '@/lib/colors';
import { extractUrls, formatSessionDate } from '@/lib/format';
import type { Folder } from '@/lib/types';
import { cn } from '@/lib/utils';
import { addFromText, createFolder, setSelection, trashItems, useStore } from '@/store/store';
import { askMoveItems, focusFolderTitle } from '@/store/ui';
import { pickFiles, uploadFiles } from '@/store/uploads';

// One box for everything: paste links (one or many) or type a note, then press Enter.
// Files can be pasted, dropped or picked with the paperclip.
export function QuickAdd({ folderId }: { folderId: string | null }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const urls = text.trim() ? extractUrls(text) : null;

  const submit = async () => {
    if (!text.trim()) return;
    const value = text;
    setText('');
    await addFromText(value, folderId);
    ref.current?.focus();
  };

  return (
    <div className="bg-card focus-within:ring-ring/30 flex items-start gap-2 rounded-xl border px-3 py-2 shadow-xs transition focus-within:ring-3">
      <Plus className="text-muted-foreground mt-1.5 size-4 shrink-0" />
      <textarea
        ref={ref}
        rows={1}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          event.target.style.height = 'auto';
          event.target.style.height = `${Math.min(event.target.scrollHeight, 200)}px`;
        }}
        onPaste={(event) => {
          const files = [...event.clipboardData.files];
          if (files.length) {
            event.preventDefault();
            uploadFiles(files, folderId);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            void submit();
            event.currentTarget.style.height = 'auto';
          }
        }}
        placeholder="Paste a link, type a note, or drop files here"
        aria-label="Add a link or note"
        id="quick-add"
        className="placeholder:text-muted-foreground max-h-48 min-h-7 flex-1 resize-none bg-transparent py-1 text-sm outline-none"
      />
      {text.trim() ? (
        <span className="text-muted-foreground mt-1 hidden shrink-0 items-center gap-1 text-xs sm:flex">
          {urls ? (urls.length > 1 ? `Add ${urls.length} links` : 'Add link') : 'Add note'}
          <CornerDownLeft className="size-3" />
        </span>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground -mr-1"
          onClick={() => pickFiles(folderId)}
          aria-label="Upload files"
          title="Upload files"
        >
          <Paperclip />
        </Button>
      )}
    </div>
  );
}

function FolderTile({ folder, count }: { folder: Folder; count: number }) {
  const data: DropData = { type: 'folder', folderId: folder.id, tile: true };
  const { setNodeRef, isOver } = useDroppable({ id: `tile:${folder.id}`, data });
  const dragging = useDragState((state) => state.dragging);
  return (
    <Link
      ref={setNodeRef}
      to={`/s/${folder.spaceId}/f/${folder.id}`}
      data-drop-folder={folder.id}
      className={cn(
        'bg-card hover:bg-muted/50 data-[file-over]:ring-primary data-[file-over]:bg-primary/5 flex items-center gap-3 rounded-xl border p-3 transition data-[file-over]:ring-2',
        isOver && dragging && 'ring-primary bg-primary/5 ring-2'
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          folder.color ? COLORS[folder.color].soft : 'bg-muted'
        )}
      >
        <FolderGlyph folder={folder} className="size-5 text-lg" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{folder.title}</span>
        <span className="text-muted-foreground flex items-center gap-1 truncate text-xs">
          {folder.sessionDate ? (
            <>
              <CalendarDays className="size-3" /> {formatSessionDate(folder.sessionDate)}
            </>
          ) : (
            `${count} ${count === 1 ? 'item' : 'items'}`
          )}
        </span>
      </span>
    </Link>
  );
}

export function SubfolderTiles({
  parent,
  folders,
  counts,
}: {
  parent: Folder;
  folders: Folder[];
  counts: Map<string, number>;
}) {
  const navigate = useNavigate();
  const add = async () => {
    const child = await createFolder({ parentId: parent.id, title: 'Untitled folder' });
    if (child) {
      focusFolderTitle(child.id);
      navigate(`/s/${parent.spaceId}/f/${child.id}`);
    }
  };
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {folders.map((folder) => (
        <FolderTile key={folder.id} folder={folder} count={counts.get(folder.id) ?? 0} />
      ))}
      <button
        type="button"
        onClick={add}
        className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center gap-2 rounded-xl border border-dashed p-3 text-sm transition"
      >
        <FolderPlus className="size-4" /> New subfolder
      </button>
    </div>
  );
}

export function SelectionBar() {
  const selection = useStore((state) => state.selection);
  if (selection.length === 0) return null;
  return (
    <div className="bg-popover text-popover-foreground fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-xl border p-1.5 pl-3 shadow-lg">
      <span className="mr-2 text-sm font-medium">{selection.length} selected</span>
      <Button variant="ghost" size="sm" onClick={() => askMoveItems(selection)}>
        <FolderInput /> Move to…
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => trashItems(selection)}>
        <Trash2 /> Trash
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => setSelection([])} aria-label="Clear selection">
        <X />
      </Button>
    </div>
  );
}
