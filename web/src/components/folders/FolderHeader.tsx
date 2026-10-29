import { CalendarDays, ChevronRight, History, MoreHorizontal, NotebookPen, Presentation, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { FolderGlyph } from '@/components/folders/FolderGlyph';
import { FolderMenuItems } from '@/components/folders/FolderMenu';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COLOR_NAMES, COLORS, FOLDER_ICONS } from '@/lib/colors';
import { formatSessionDate } from '@/lib/format';
import { startPresenting } from '@/lib/present';
import { folderPath } from '@/lib/tree';
import type { Folder } from '@/lib/types';
import { cn } from '@/lib/utils';
import { updateFolder, useStore } from '@/store/store';
import { focusFolderTitle, showSessionNotes, useUi } from '@/store/ui';

const menuParts = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};

function Breadcrumbs({ folder }: { folder: Folder }) {
  const path = useStore(useShallow((state) => folderPath(state.folders, folder.id).slice(0, -1)));
  const spaceName = useStore((state) => state.spaces.find((space) => space.id === folder.spaceId)?.name);
  return (
    <nav className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
      <Link to={`/s/${folder.spaceId}`} className="hover:text-foreground shrink-0">
        {spaceName}
      </Link>
      {path.map((ancestor) => (
        <span key={ancestor.id} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3 shrink-0" />
          <Link to={`/s/${folder.spaceId}/f/${ancestor.id}`} className="hover:text-foreground truncate">
            {ancestor.title}
          </Link>
        </span>
      ))}
    </nav>
  );
}

// Click the folder's icon to change its emoji or colour.
function AppearancePicker({ folder }: { folder: Folder }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change icon and colour"
          className={cn(
            'hover:bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl transition',
            folder.color && COLORS[folder.color].soft
          )}
        >
          <FolderGlyph folder={folder} className="size-6 text-2xl" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="text-muted-foreground mb-2 text-xs font-medium">Colour</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_NAMES.map((color) => (
            <button
              key={color}
              type="button"
              title={COLORS[color].label}
              onClick={() => updateFolder(folder.id, { color })}
              className={cn(
                'size-6 rounded-full transition hover:scale-110',
                COLORS[color].dot,
                folder.color === color && 'ring-foreground ring-2 ring-offset-2'
              )}
            />
          ))}
          <button
            type="button"
            title="No colour"
            onClick={() => updateFolder(folder.id, { color: null })}
            className="text-muted-foreground flex size-6 items-center justify-center rounded-full border"
          >
            <X className="size-3" />
          </button>
        </div>
        <p className="text-muted-foreground mt-4 mb-2 text-xs font-medium">Icon</p>
        <div className="grid grid-cols-8 gap-1">
          {FOLDER_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => updateFolder(folder.id, { icon })}
              className={cn(
                'hover:bg-muted flex size-7 items-center justify-center rounded text-lg',
                folder.icon === icon && 'bg-muted'
              )}
            >
              {icon}
            </button>
          ))}
          <button
            type="button"
            title="No icon"
            onClick={() => updateFolder(folder.id, { icon: null })}
            className="text-muted-foreground hover:bg-muted flex size-7 items-center justify-center rounded"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Optional date and term turn a folder into a session (a class, workshop, meeting...).
function SessionDetails({ folder }: { folder: Folder }) {
  const [date, setDate] = useState(folder.sessionDate ?? '');
  const [term, setTerm] = useState(folder.term ?? '');
  const isSession = folder.sessionDate || folder.term;

  const save = () => updateFolder(folder.id, { sessionDate: date || null, term: term.trim() || null });

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setDate(folder.sessionDate ?? '');
          setTerm(folder.term ?? '');
        } else if (date !== (folder.sessionDate ?? '') || term.trim() !== (folder.term ?? '')) {
          void save();
        }
      }}
    >
      <PopoverTrigger asChild>
        {isSession ? (
          <button
            type="button"
            className="hover:bg-muted flex flex-wrap items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm"
          >
            <CalendarDays className="text-muted-foreground size-4" />
            {folder.sessionDate && <span>{formatSessionDate(folder.sessionDate)}</span>}
            {folder.term && <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">{folder.term}</span>}
          </button>
        ) : (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-sm"
          >
            <CalendarDays className="size-4" /> Add date or term
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="mb-3 text-sm font-medium">Session details</p>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="session-date">Date</Label>
            <Input id="session-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="session-term">Term, cohort or series</Label>
            <Input
              id="session-term"
              placeholder="e.g. Term 1 2026"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
            />
          </div>
          {isSession && (
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => {
                setDate('');
                setTerm('');
                void updateFolder(folder.id, { sessionDate: null, term: null });
              }}
            >
              Clear session details
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// A textarea rather than an input so long titles wrap on narrow screens; titles stay one line.
function TitleInput({ folder }: { folder: Folder }) {
  const [value, setValue] = useState(folder.title);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusId = useUi((state) => state.focusTitleFolderId);

  const fit = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  useEffect(() => {
    if (focusId === folder.id) {
      inputRef.current?.focus();
      inputRef.current?.select();
      focusFolderTitle(null);
    }
  }, [focusId, folder.id]);

  const commit = () => {
    const title = value.trim();
    if (!title) setValue(folder.title);
    else if (title !== folder.title) void updateFolder(folder.id, { title });
  };

  return (
    <textarea
      ref={inputRef}
      rows={1}
      value={value}
      onChange={(event) => {
        setValue(event.target.value.replace(/\s*\n\s*/g, ' '));
        fit();
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === 'Escape') {
          setValue(folder.title);
          requestAnimationFrame(() => inputRef.current?.blur());
        }
      }}
      aria-label="Folder title"
      className="placeholder:text-muted-foreground block w-full min-w-0 resize-none overflow-hidden rounded-md bg-transparent text-2xl leading-tight font-semibold tracking-tight outline-none focus:ring-0"
      placeholder="Untitled folder"
    />
  );
}

// Where this session came from and where it has run since ("Run again" copies).
function FolderHistory({ folder }: { folder: Folder }) {
  const original = useStore((state) => (folder.copiedFrom ? state.folders[folder.copiedFrom] : undefined));
  const copies = useStore(
    useShallow((state) =>
      Object.values(state.folders)
        .filter((f) => f.copiedFrom === folder.id && !f.deletedAt)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    )
  );
  if (!original && copies.length === 0) return null;
  const label = (f: Folder) =>
    [f.title, f.term, f.sessionDate && formatSessionDate(f.sessionDate)].filter(Boolean).join(' · ');
  const link = (f: Folder) => (
    <Link
      key={f.id}
      to={`/s/${f.spaceId}/f/${f.id}`}
      className="hover:text-foreground underline-offset-2 hover:underline"
    >
      {label(f)}
    </Link>
  );
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 px-1.5 pt-0.5 text-xs">
      <History className="size-3.5" />
      {original && <span>Run again from {link(original)}</span>}
      {original && copies.length > 0 && <span>·</span>}
      {copies.length > 0 && (
        <span className="flex flex-wrap gap-x-1.5">
          Run again as{' '}
          {copies.map((copy, index) => (
            <span key={copy.id}>
              {link(copy)}
              {index < copies.length - 1 && ','}
            </span>
          ))}
        </span>
      )}
    </p>
  );
}

function NotesToggle({ folder }: { folder: Folder }) {
  const open = useUi((state) => state.sessionNotesOpen);
  return (
    <Button
      variant={open ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => showSessionNotes(!open)}
      aria-pressed={open}
      title="Session notes"
    >
      <NotebookPen />
      <span className="hidden sm:inline">Notes</span>
      {folder.notes.trim() && !open && <span className="bg-primary size-1.5 rounded-full" aria-label="has notes" />}
    </Button>
  );
}

export function FolderHeader({ folder }: { folder: Folder }) {
  return (
    <div className="flex flex-col gap-2">
      <Breadcrumbs folder={folder} />
      <div className="flex items-center gap-3">
        <AppearancePicker folder={folder} />
        <div className="min-w-0 flex-1">
          {/* Remounts when the saved title changes (e.g. renamed on another device). */}
          <TitleInput key={folder.title} folder={folder} />
          <SessionDetails folder={folder} />
          <FolderHistory folder={folder} />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => startPresenting(folder.spaceId, folder.id)}
          title="Present this folder full screen"
        >
          <Presentation />
          <span className="hidden sm:inline">Present</span>
        </Button>
        <NotesToggle folder={folder} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Folder options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <FolderMenuItems folder={folder} parts={menuParts} onRename={() => focusFolderTitle(folder.id)} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
