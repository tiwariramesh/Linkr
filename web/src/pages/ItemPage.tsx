import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe,
  History,
  PanelRightClose,
  PanelRightOpen,
  Presentation,
  X,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { DraftNotes, ItemNotes, SessionNotes } from '@/components/editor/Notes';
import { ItemHighlights } from '@/components/highlights/HighlightList';
import { Favicon, ItemMenu } from '@/components/items/ItemParts';
import { defaultMode, Preview, type LinkMode } from '@/components/preview/Preview';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { videoEmbedUrl } from '@/lib/embed';
import { formatSessionDate } from '@/lib/format';
import { readInboxView } from '@/lib/inbox-view';
import { externalUrl, itemPath, itemSubtitle } from '@/lib/items';
import { startPresenting } from '@/lib/present';
import { folderPath, itemsInFolder } from '@/lib/tree';
import { sameLinkElsewhere } from '@/lib/urls';
import type { Folder, Item } from '@/lib/types';
import { cn } from '@/lib/utils';
import { updateItem, useCanEdit, useStore } from '@/store/store';
import { focusHighlight, focusItemTitle, showItemNotes, useUi } from '@/store/ui';

const SPLIT_KEY = 'linkr-split';
const clampSplit = (value: number) => Math.min(0.75, Math.max(0.3, value));
function readSplit() {
  try {
    const saved = Number(localStorage.getItem(SPLIT_KEY));
    return saved ? clampSplit(saved) : 0.6;
  } catch {
    return 0.6;
  }
}

const isTyping = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

// The draggable line between the two panes. Arrow keys move it too.
function Divider({ split, onChange }: { split: number; onChange: (split: number, done: boolean) => void }) {
  const [dragging, setDragging] = useState(false);
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const container = event.currentTarget.closest('[data-split]')!.getBoundingClientRect();
    const at = (x: number) => clampSplit((x - container.left) / container.width);
    let latest = split;
    setDragging(true);
    const move = (moveEvent: PointerEvent) => {
      latest = at(moveEvent.clientX);
      onChange(latest, false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener(
      'pointerup',
      () => {
        window.removeEventListener('pointermove', move);
        setDragging(false);
        onChange(latest, true);
      },
      { once: true }
    );
  };
  const onKey = (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      onChange(clampSplit(split + (event.key === 'ArrowLeft' ? -0.05 : 0.05)), true);
    }
  };
  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        aria-valuenow={Math.round(split * 100)}
        tabIndex={0}
        onPointerDown={start}
        onKeyDown={onKey}
        className="hover:bg-primary/30 focus-visible:bg-primary/40 relative w-1 shrink-0 cursor-col-resize bg-transparent outline-none after:absolute after:inset-y-0 after:-inset-x-1"
      />
      {/* While dragging, a cover stops the framed page from swallowing the pointer. */}
      {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </>
  );
}

function NotesPane({ item, folder }: { item: Item; folder: Folder | undefined }) {
  // Beside a link or file: its notes, its highlights (pages only) and the folder's session notes.
  const highlightCount = useStore(
    (s) => Object.values(s.highlights).filter((highlight) => highlight.itemId === item.id).length
  );
  const tabs = [
    { id: 'item', label: 'Notes' },
    // Highlights are made in a page's reader copy.
    ...(item.kind === 'link'
      ? [{ id: 'highlights', label: `Highlights${highlightCount ? ` ${highlightCount}` : ''}` }]
      : []),
    ...(folder
      ? [
          { id: 'session', label: 'Session notes' },
          { id: 'draft', label: 'My draft' },
        ]
      : []),
  ];
  const [tab, setTab] = useState(tabs[0]?.id);
  if (!tabs.length) return null;
  const current = tabs.some((t) => t.id === tab) ? tab : tabs[0].id;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 gap-1 border-b px-2 pt-2" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={current === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 pb-2 text-sm font-medium',
              current === t.id
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            {t.label}
            {t.id === 'session' && folder && (
              <span className="text-muted-foreground hidden font-normal xl:inline"> · {folder.title}</span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {current === 'item' ? (
          <ItemNotes item={item} />
        ) : current === 'highlights' ? (
          <ItemHighlights item={item} />
        ) : current === 'draft' ? (
          folder && <DraftNotes folder={folder} />
        ) : (
          folder && <SessionNotes folder={folder} />
        )}
      </div>
    </div>
  );
}

// The same link saved in other folders: where else it has been used, across sessions and terms.
function UsedIn({ item }: { item: Item }) {
  const navigate = useNavigate();
  const items = useStore((s) => s.items);
  const folders = useStore((s) => s.folders);
  const others = useMemo(() => sameLinkElsewhere(items, item), [items, item]);
  if (others.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="Where else this link is saved">
          <History /> <span className="hidden md:inline">Used in</span> {others.length}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1">
        <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs">Also saved in</p>
        {others.map((other) => {
          const folder = other.folderId ? folders[other.folderId] : undefined;
          return (
            <button
              key={other.id}
              type="button"
              onClick={() => navigate(itemPath(other))}
              className="hover:bg-muted flex w-full flex-col rounded-md px-2 py-1.5 text-left"
            >
              <span className="truncate text-sm">
                {folder
                  ? folderPath(folders, folder.id)
                      .map((f) => f.title)
                      .join(' / ')
                  : 'Inbox'}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {[
                  folder?.term,
                  folder?.sessionDate && formatSessionDate(folder.sessionDate),
                  other.deletedAt && 'in Trash',
                ]
                  .filter(Boolean)
                  .join(' · ') || `Saved ${new Date(other.createdAt).toLocaleDateString()}`}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// A note's title, edited in place like a document title. Enter moves on to the text.
function NoteTitle({ item }: { item: Item }) {
  const [value, setValue] = useState(item.title);
  const ref = useRef<HTMLTextAreaElement>(null);
  const focusId = useUi((s) => s.focusTitleItemId);
  const canEdit = useCanEdit();
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(fit, []);
  useEffect(() => {
    if (focusId !== item.id) return;
    ref.current?.focus();
    ref.current?.select();
    focusItemTitle(null);
  }, [focusId, item.id]);
  const commit = () => {
    const title = value.trim();
    if (!title) setValue(item.title);
    else if (title !== item.title) void updateItem(item.id, { title });
  };
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={1000}
      onChange={(event) => {
        setValue(event.target.value.replace(/\s*\n\s*/g, ' '));
        fit();
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          // On to the note itself.
          (
            event.currentTarget
              .closest('[data-note-page]')
              ?.querySelector('[contenteditable="true"]') as HTMLElement | null
          )?.focus();
        }
        if (event.key === 'Escape') setValue(item.title);
      }}
      aria-label="Note title"
      readOnly={!canEdit}
      placeholder="Untitled"
      className="placeholder:text-muted-foreground/50 block w-full resize-none overflow-hidden bg-transparent text-3xl leading-tight font-bold tracking-tight outline-none sm:text-4xl"
    />
  );
}

// A note opened on its own: title, then the text, in a reading-width column.
function NotePage({ item }: { item: Item }) {
  return (
    <div className="h-full overflow-y-auto" data-note-page>
      <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pt-10 pb-4 sm:px-8">
        <div className="px-3 sm:px-[54px]">
          <NoteTitle key={item.title} item={item} />
        </div>
        <ItemNotes item={item} className="min-h-[60svh]" />
      </div>
    </div>
  );
}

export function ItemPage() {
  const { itemId } = useParams();
  return <ItemView key={itemId} />;
}

function ItemView() {
  const { spaceId, itemId = '' } = useParams();
  const navigate = useNavigate();
  const ready = useStore((state) => state.spaceId === spaceId && !state.loading);
  const item = useStore((state) => state.items[itemId]);
  const folder = useStore((state) => (item?.folderId ? state.folders[item.folderId] : undefined));
  const items = useStore((state) => state.items);
  const [mode, setMode] = useState<LinkMode>(() => (item ? defaultMode(item) : 'reader'));
  const [split, setSplit] = useState(readSplit);
  const [mobilePane, setMobilePane] = useState<'preview' | 'notes'>('preview');
  const notesOpen = useUi((s) => s.itemNotesOpen);
  const [searchParams] = useSearchParams();
  const focusId = useUi((s) => s.focusHighlightId);

  // Opened from a folder's highlights (?h=id): go to that highlight.
  useEffect(() => {
    const id = searchParams.get('h');
    if (id) focusHighlight(id);
  }, [searchParams]);

  // Highlights only exist in the reader view, so picking one switches to it (and to the preview on phones).
  if (focusId && item?.kind === 'link' && (mode !== 'reader' || mobilePane !== 'preview')) {
    setMode('reader');
    setMobilePane('preview');
  }
  const backTo = folder ? `/s/${spaceId}/f/${folder.id}` : `/s/${spaceId}`;
  const backRef = useRef(backTo);

  // Previous and next follow the folder's order on screen.
  const siblings = useMemo(() => {
    if (!item) return [];
    const sort = (folder ? folder.view.sort : readInboxView().sort) ?? 'manual';
    return itemsInFolder(items, item.folderId, sort);
  }, [items, item, folder]);
  const index = siblings.findIndex((sibling) => sibling.id === itemId);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 ? siblings[index + 1] : undefined;
  const neighbours = useRef({ previous, next });

  useEffect(() => {
    backRef.current = backTo;
    neighbours.current = { previous, next };
  });

  // Esc closes; ← and → step through the folder (not while typing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        isTyping(event.target) ||
        document.querySelector('[role="dialog"]') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const { previous: before, next: after } = neighbours.current;
      if (event.key === 'Escape') navigate(backRef.current);
      else if (event.key === 'ArrowLeft' && before) navigate(itemPath(before), { replace: true });
      else if (event.key === 'ArrowRight' && after) navigate(itemPath(after), { replace: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (!ready) {
    return (
      <div className="flex flex-1 gap-4 p-4">
        <Skeleton className="flex-[3]" />
        <Skeleton className="flex-[2]" />
      </div>
    );
  }
  if (!item || item.deletedAt) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-sm">
        {item ? 'This item is in the Trash.' : 'This item doesn’t exist any more.'}
        <Button variant="outline" size="sm" asChild>
          <Link to={backTo}>Back to {folder?.title ?? 'Inbox'}</Link>
        </Button>
      </div>
    );
  }

  const isNote = item.kind === 'note';
  const hasModes = item.kind === 'link' && !videoEmbedUrl(item.url);
  // A note is its own page; links and files can show their notes beside them.
  const hasNotesPane = !isNote && notesOpen;
  const changeSplit = (value: number, done: boolean) => {
    setSplit(value);
    if (done) {
      try {
        localStorage.setItem(SPLIT_KEY, String(value));
      } catch {
        // storage blocked
      }
    }
  };

  const main = isNote ? <NotePage item={item} /> : <Preview item={item} mode={mode} onModeChange={setMode} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5 sm:gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to={backTo} aria-label="Close (Esc)" title="Close (Esc)">
            <X />
          </Link>
        </Button>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!previous}
            onClick={() => previous && navigate(itemPath(previous), { replace: true })}
            aria-label="Previous item (←)"
            title="Previous (←)"
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground hidden w-12 text-center text-xs tabular-nums sm:block">
            {index + 1} / {siblings.length}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!next}
            onClick={() => next && navigate(itemPath(next), { replace: true })}
            aria-label="Next item (→)"
            title="Next (→)"
          >
            <ChevronRight />
          </Button>
        </div>
        <Favicon item={item} className="ml-1 hidden sm:block" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{item.title}</h1>
          <p className="text-muted-foreground truncate text-xs">
            {folder?.title ?? 'Inbox'} · {itemSubtitle(item)}
          </p>
        </div>
        {hasModes && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(value) => value && setMode(value as LinkMode)}
            className="flex"
          >
            <ToggleGroupItem value="live" aria-label="Live page" title="Live page">
              <Globe /> <span className="hidden lg:inline">Live</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="reader" aria-label="Reader view" title="Reader view">
              <BookOpen /> <span className="hidden lg:inline">Reader</span>
            </ToggleGroupItem>
          </ToggleGroup>
        )}
        <UsedIn item={item} />
        {!isNote && (
          <Button
            variant={notesOpen ? 'secondary' : 'ghost'}
            size="icon"
            onClick={() => showItemNotes(!notesOpen)}
            aria-pressed={notesOpen}
            aria-label={notesOpen ? 'Hide notes' : 'Show notes'}
            title={notesOpen ? 'Hide notes' : 'Show notes'}
          >
            {notesOpen ? <PanelRightClose /> : <PanelRightOpen />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => startPresenting(item.spaceId, item.folderId, item.id)}
          aria-label="Present from here"
          title="Present the folder from this item"
          className="hidden sm:inline-flex"
        >
          <Presentation />
        </Button>
        {externalUrl(item) && (
          <Button variant="ghost" size="icon" asChild>
            <a
              href={externalUrl(item)!}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open in new tab"
              title="Open in new tab"
            >
              <ExternalLink />
            </a>
          </Button>
        )}
        <ItemMenu item={item} className="size-8 border-0 shadow-none" />
      </header>

      {hasNotesPane && (
        <div className="flex shrink-0 gap-1 border-b p-1 md:hidden" role="tablist" aria-label="Show">
          {(['preview', 'notes'] as const).map((pane) => (
            <button
              key={pane}
              type="button"
              role="tab"
              aria-selected={mobilePane === pane}
              onClick={() => setMobilePane(pane)}
              className={cn(
                'flex-1 rounded-md py-1.5 text-sm font-medium',
                mobilePane === pane ? 'bg-muted text-foreground' : 'text-muted-foreground'
              )}
            >
              {pane === 'preview' ? 'Preview' : 'Notes'}
            </button>
          ))}
        </div>
      )}

      <div data-split className="flex min-h-0 flex-1" style={{ '--split': `${split * 100}%` } as CSSProperties}>
        <section
          className={cn(
            'min-h-0 min-w-0 flex-1',
            hasNotesPane && 'md:flex-none md:basis-(--split)',
            hasNotesPane && mobilePane !== 'preview' && 'hidden md:block'
          )}
        >
          {main}
        </section>
        {hasNotesPane && (
          <>
            <div className="hidden md:flex">
              <Divider split={split} onChange={changeSplit} />
            </div>
            <aside className={cn('min-h-0 min-w-0 flex-1 border-l', mobilePane !== 'notes' && 'hidden md:block')}>
              <NotesPane item={item} folder={folder} />
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
