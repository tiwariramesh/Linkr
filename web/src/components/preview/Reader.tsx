import DOMPurify from 'dompurify';
import { Copy, Globe, Loader2, MessageSquarePlus, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Message } from '@/components/preview/Message';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { describeSelection, markPassage, type TextQuote } from '@/lib/anchoring';
import { api, ApiError } from '@/lib/api';
import { HIGHLIGHT_COLOR_NAMES, HIGHLIGHT_COLORS } from '@/lib/colors';
import type { HighlightColor, Item } from '@/lib/types';
import { cn } from '@/lib/utils';
import { createHighlight, deleteHighlight, updateHighlight, useStore } from '@/store/store';
import { focusHighlight, useUi } from '@/store/ui';

type ReaderCopy = { html: string; byline: string | null; words: number; fetchedAt: string };

// Reader copies come from other sites: keep only plain article markup, and make links open in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
  if (node.tagName === 'IMG') {
    node.setAttribute('referrerpolicy', 'no-referrer');
    node.setAttribute('loading', 'lazy');
  }
});
const sanitize = (html: string) =>
  DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'mark'],
    FORBID_ATTR: ['style', 'class', 'id'],
  });

// The little bar over a selection or a clicked highlight. `top` and `left` are in the scrolling
// container's coordinates, so it moves with the text.
type Popup =
  | { kind: 'new'; quote: TextQuote; top: number; left: number; commenting: boolean }
  | { kind: 'edit'; id: string; top: number; left: number };

function Swatches({ current, onPick }: { current?: HighlightColor; onPick: (color: HighlightColor) => void }) {
  return (
    <div className="flex items-center gap-1">
      {HIGHLIGHT_COLOR_NAMES.map((color) => (
        <button
          key={color}
          type="button"
          title={`Highlight ${HIGHLIGHT_COLORS[color].label.toLowerCase()}`}
          aria-label={`Highlight ${HIGHLIGHT_COLORS[color].label.toLowerCase()}`}
          aria-pressed={current === color}
          onClick={() => onPick(color)}
          className={cn(
            'size-5 rounded-full border border-black/10 transition hover:scale-110',
            HIGHLIGHT_COLORS[color].swatch,
            current === color && 'ring-foreground ring-2 ring-offset-1'
          )}
        />
      ))}
    </div>
  );
}

function CommentBox({
  initial,
  onSave,
  autoFocus,
}: {
  initial: string;
  onSave: (text: string) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  return (
    <Textarea
      autoFocus={autoFocus}
      rows={3}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => text !== initial && onSave(text.trim())}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) onSave(text.trim());
      }}
      placeholder="Add a comment: why it matters, a question to ask…"
      className="min-h-16 text-sm"
    />
  );
}

export function Reader({ item, onLive }: { item: Item; onLive: () => void }) {
  const [state, setState] = useState<{ copy?: ReaderCopy; loading: boolean }>({ loading: true });
  const highlights = useStore(
    useShallow((s) =>
      Object.values(s.highlights)
        .filter((highlight) => highlight.itemId === item.id)
        .sort((a, b) => a.start - b.start)
    )
  );
  const editable = useStore((s) => s.spaces.find((space) => space.id === item.spaceId)?.role !== 'viewer');
  const focusId = useUi((s) => s.focusHighlightId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Popup | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ReaderCopy>(`/items/${item.id}/content`)
      .then((copy) => !cancelled && setState({ copy: { ...copy, html: sanitize(copy.html) }, loading: false }))
      .catch((error) => {
        if (!cancelled) setState({ loading: false });
        if (!(error instanceof ApiError) || error.status !== 404) console.warn(error);
      });
    return () => {
      cancelled = true;
    };
    // A new fetch (e.g. after "Refresh preview") brings a new reader copy.
  }, [item.id, item.fetchStatus]);

  // Draw the article, then mark each highlight in it. Runs again whenever highlights change.
  useLayoutEffect(() => {
    const root = bodyRef.current;
    if (!root || !state.copy) return;
    root.innerHTML = state.copy.html;
    const lost: string[] = [];
    for (const highlight of highlights) {
      const marked = markPassage(root, highlight, {
        'data-highlight-id': highlight.id,
        'data-color': highlight.color,
        ...(highlight.comment ? { 'data-comment': '', title: highlight.comment } : {}),
      });
      if (!marked) lost.push(highlight.id);
    }
    useUi.setState({ lostHighlightIds: lost });
  }, [state.copy, highlights]);

  useEffect(() => () => useUi.setState({ lostHighlightIds: [] }), []);

  // Esc closes the bar (the split view's own Esc waits while it's open).
  useEffect(() => {
    if (!popup) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setPopup(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [popup]);

  // Jump to a highlight picked from a list.
  // Done (found or not) once the article has loaded, so the request never lingers.
  useEffect(() => {
    if (!focusId || state.loading) return;
    const marks = bodyRef.current?.querySelectorAll<HTMLElement>(`mark[data-highlight-id="${focusId}"]`) ?? [];
    if (marks.length) {
      marks[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      marks.forEach((m) => m.classList.add('flash'));
      window.setTimeout(() => marks.forEach((m) => m.classList.remove('flash')), 1600);
    } else {
      toast('That highlight isn’t in the current copy of the page');
    }
    focusHighlight(null);
  }, [focusId, state.loading, highlights]);

  const place = (rect: DOMRect) => {
    const box = scrollRef.current!.getBoundingClientRect();
    return {
      top: rect.top - box.top + scrollRef.current!.scrollTop,
      left: Math.min(Math.max(rect.left - box.left + rect.width / 2, 120), box.width - 120),
    };
  };

  // Offer to highlight whatever is selected in the article (mouse, keyboard or touch).
  useEffect(() => {
    if (!editable) return;
    let timer: number | undefined;
    const check = () => {
      // Typing a comment moves the selection into the box; keep the bar open.
      if (popupRef.current?.contains(document.activeElement)) return;
      const selection = window.getSelection();
      const root = bodyRef.current;
      if (!root || !selection || selection.isCollapsed || !selection.rangeCount) {
        setPopup((current) => (current?.kind === 'new' ? null : current));
        return;
      }
      const range = selection.getRangeAt(0);
      if (!root.contains(range.commonAncestorContainer)) return;
      const quote = describeSelection(root, range);
      if (quote) setPopup({ kind: 'new', quote, commenting: false, ...place(range.getBoundingClientRect()) });
    };
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(check, 250);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.clearTimeout(timer);
    };
  }, [editable]);

  // Clicking a highlight opens it for editing.
  const onArticleClick = (event: ReactMouseEvent) => {
    const mark = (event.target as HTMLElement).closest<HTMLElement>('mark[data-highlight-id]');
    if (!window.getSelection()?.isCollapsed) return;
    if (!mark || !editable || event.ctrlKey || event.metaKey) {
      setPopup((current) => (current?.kind === 'edit' ? null : current));
      return;
    }
    // A highlight inside a link edits the highlight; Ctrl/Cmd-click still follows the link.
    event.preventDefault();
    setPopup({ kind: 'edit', id: mark.dataset.highlightId!, ...place(mark.getBoundingClientRect()) });
  };

  const create = (quote: TextQuote, color: HighlightColor, comment = '') => {
    void createHighlight({ itemId: item.id, ...quote, color, comment });
    window.getSelection()?.removeAllRanges();
    setPopup(null);
  };

  if (state.loading) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Making a reader copy…
      </div>
    );
  }
  if (!state.copy) {
    return (
      <Message
        item={item}
        text="There’s no reader copy of this page: it has little text to read, or couldn’t be fetched."
      >
        {item.frameable !== false && (
          <Button variant="outline" size="sm" onClick={onLive}>
            <Globe /> Show the live page
          </Button>
        )}
      </Message>
    );
  }

  const minutes = Math.max(1, Math.round(state.copy.words / 230));
  const editing = popup?.kind === 'edit' ? highlights.find((h) => h.id === popup.id) : undefined;
  const below = popup ? popup.top < 140 : false;
  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-y-auto"
      onScroll={() => popup?.kind === 'edit' && setPopup(null)}
    >
      <article className="prose prose-sm sm:prose-base dark:prose-invert mx-auto max-w-2xl px-6 py-8">
        <p className="text-muted-foreground not-prose mb-2 text-xs">
          {item.siteName}
          {state.copy.byline && ` · ${state.copy.byline}`} · {minutes} min read
          {editable && ' · Select text to highlight it'}
        </p>
        <h1>{item.title}</h1>
        <div ref={bodyRef} onClick={onArticleClick} className="reader-body" />
      </article>

      {popup && (popup.kind === 'new' || editing) && (
        <div
          ref={popupRef}
          role="dialog"
          aria-label={popup.kind === 'new' ? 'Highlight selection' : 'Edit highlight'}
          onMouseDown={(event) => {
            // Keep the text selected while choosing a colour.
            if (!(event.target as HTMLElement).closest('textarea')) event.preventDefault();
          }}
          className={cn(
            'bg-popover text-popover-foreground absolute z-20 flex w-64 -translate-x-1/2 flex-col gap-2 rounded-lg border p-2 shadow-lg',
            below ? 'mt-8' : '-translate-y-full -mt-2'
          )}
          style={{ top: popup.top, left: popup.left }}
        >
          {popup.kind === 'new' ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <Swatches onPick={(color) => create(popup.quote, color)} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Highlight with a comment"
                  aria-label="Highlight with a comment"
                  onClick={() => setPopup({ ...popup, commenting: true })}
                >
                  <MessageSquarePlus />
                </Button>
              </div>
              {popup.commenting && (
                <CommentBox initial="" autoFocus onSave={(text) => create(popup.quote, 'yellow', text)} />
              )}
            </>
          ) : (
            editing && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Swatches current={editing.color} onPick={(color) => void updateHighlight(editing.id, { color })} />
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Copy text"
                      aria-label="Copy text"
                      onClick={() => {
                        void navigator.clipboard.writeText(editing.quote);
                        toast.success('Copied');
                      }}
                    >
                      <Copy />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Remove highlight"
                      aria-label="Remove highlight"
                      className="text-destructive"
                      onClick={() => {
                        void deleteHighlight(editing.id);
                        setPopup(null);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <CommentBox
                  key={editing.id}
                  initial={editing.comment}
                  onSave={(comment) => void updateHighlight(editing.id, { comment })}
                />
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
