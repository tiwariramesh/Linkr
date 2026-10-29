import { BookOpen, ChevronLeft, ChevronRight, Globe, Maximize, Minimize, NotebookText, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { RichView } from '@/components/editor/RichEditor';
import { Favicon } from '@/components/items/ItemParts';
import { defaultMode, Preview, type LinkMode } from '@/components/preview/Preview';
import { Button } from '@/components/ui/button';
import { videoEmbedUrl } from '@/lib/embed';
import { formatSessionDate } from '@/lib/format';
import { readInboxView } from '@/lib/inbox-view';
import { itemsInFolder } from '@/lib/tree';
import type { Item } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/store';

const isTyping = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');

// One item on screen: a note as large text, anything else in its preview.
function Slide({ item, mode, onModeChange }: { item: Item; mode: LinkMode; onModeChange: (mode: LinkMode) => void }) {
  if (item.kind === 'note') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-10 py-16">
          <RichView body={item.body} fallbackText={item.notes} className="prose-xl lg:prose-2xl" />
        </div>
      </div>
    );
  }
  return <Preview item={item} mode={mode} onModeChange={onModeChange} />;
}

// Presenter mode: a folder's items one at a time, full screen, with speaker notes on demand.
// → / Space / Page Down: next · ← / Page Up: previous · N: notes · F: full screen · Esc: leave.
export function PresentPage() {
  const { spaceId, folderId = 'inbox' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ready = useStore((state) => state.spaceId === spaceId && !state.loading);
  const folder = useStore((state) => (folderId === 'inbox' ? undefined : state.folders[folderId]));
  const allItems = useStore((state) => state.items);
  const items = useMemo(() => {
    const sort = (folder ? folder.view.sort : readInboxView().sort) ?? 'manual';
    return itemsInFolder(allItems, folder?.id ?? null, sort);
  }, [allItems, folder]);

  const [index, setIndex] = useState<number | null>(null);
  const [modes, setModes] = useState<Record<string, LinkMode>>({});
  const [notesOpen, setNotesOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  const back = folder ? `/s/${spaceId}/f/${folder.id}` : `/s/${spaceId}`;

  // Start at the item it was opened from (?i=), else the first.
  const start = Math.max(
    0,
    items.findIndex((item) => item.id === params.get('i'))
  );
  const current = Math.min(index ?? start, items.length); // items.length = the closing slide
  const item = items[current] as Item | undefined;
  const mode = item ? (modes[item.id] ?? defaultMode(item)) : 'reader';

  const state = useRef({ current, total: items.length, back });
  useEffect(() => {
    state.current = { current, total: items.length, back };
  });

  const leave = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    navigate(state.current.back);
  };
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const go = (to: number) => setIndex(Math.max(0, Math.min(to, state.current.total)));
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const { current: at, total } = state.current;
      switch (event.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          go(at + 1);
          break;
        case 'ArrowLeft':
        case 'PageUp':
          go(at - 1);
          break;
        case 'Home':
          go(0);
          break;
        case 'End':
          go(total - 1);
          break;
        case 'n':
        case 'N':
          setNotesOpen((open) => !open);
          break;
        case 'f':
        case 'F':
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen?.().catch(() => {});
          break;
        case 'Escape':
          // In full screen the browser takes the first Esc to leave it; the next one leaves presenting.
          leaveRef.current();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return <div className="bg-background fixed inset-0 z-50" />;

  const title = folder?.title ?? 'Inbox';
  const hasModes = item?.kind === 'link' && !videoEmbedUrl(item.url);
  const go = (to: number) => setIndex(Math.max(0, Math.min(to, items.length)));

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col" role="region" aria-label={`Presenting ${title}`}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={leave}
          aria-label="Stop presenting (Esc)"
          title="Stop presenting (Esc)"
        >
          <X />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{title}</span>
          {folder?.sessionDate && (
            <span className="text-muted-foreground"> · {formatSessionDate(folder.sessionDate)}</span>
          )}
          {item && (
            <span className="text-muted-foreground">
              {' '}
              · <Favicon item={item} className="inline size-3.5 align-[-2px]" /> {item.title}
            </span>
          )}
        </div>
        {hasModes && item && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModes({ ...modes, [item.id]: mode === 'live' ? 'reader' : 'live' })}
            title={mode === 'live' ? 'Show the reader view' : 'Show the live page'}
          >
            {mode === 'live' ? <BookOpen /> : <Globe />}
            <span className="hidden sm:inline">{mode === 'live' ? 'Reader' : 'Live'}</span>
          </Button>
        )}
        <Button
          variant={notesOpen ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setNotesOpen(!notesOpen)}
          aria-pressed={notesOpen}
          title="Speaker notes (N)"
        >
          <NotebookText /> <span className="hidden sm:inline">Notes</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            document.fullscreenElement
              ? void document.exitFullscreen()
              : void document.documentElement.requestFullscreen?.().catch(() => {})
          }
          aria-label={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
          title={fullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </Button>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={current === 0}
            onClick={() => go(current - 1)}
            aria-label="Previous (←)"
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground w-14 text-center text-xs tabular-nums" aria-live="polite">
            {Math.min(current + 1, items.length)} / {items.length}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={current >= items.length}
            onClick={() => go(current + 1)}
            aria-label="Next (→)"
          >
            <ChevronRight />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1">
          {item ? (
            <Slide key={item.id} item={item} mode={mode} onModeChange={(m) => setModes({ ...modes, [item.id]: m })} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <p className="text-2xl font-semibold">{items.length ? 'That’s everything' : 'Nothing to present yet'}</p>
              <p className="text-muted-foreground text-sm">
                {items.length ? `${items.length} items in ${title}` : 'Add links, files or notes to this folder first.'}
              </p>
              <div className="flex gap-2">
                {items.length > 0 && (
                  <Button variant="outline" onClick={() => go(0)}>
                    Start again
                  </Button>
                )}
                <Button onClick={leave}>Stop presenting</Button>
              </div>
            </div>
          )}
        </main>
        {notesOpen && (
          <aside
            className={cn('bg-muted/30 w-[min(34%,420px)] shrink-0 overflow-y-auto border-l px-5 py-4')}
            aria-label="Speaker notes"
          >
            {item && item.kind !== 'note' && (
              <section className="mb-6">
                <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">This item</h2>
                {item.notes.trim() ? (
                  <RichView body={item.body} fallbackText={item.notes} className="prose-sm" />
                ) : (
                  <p className="text-muted-foreground text-sm">No notes on this item.</p>
                )}
              </section>
            )}
            {folder && (
              <section>
                <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                  Session notes
                </h2>
                {folder.notes.trim() ? (
                  <RichView body={folder.body} fallbackText={folder.notes} className="prose-sm" />
                ) : (
                  <p className="text-muted-foreground text-sm">No session notes.</p>
                )}
              </section>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
