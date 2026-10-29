import { Copy, Highlighter, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { Favicon } from '@/components/items/ItemParts';
import { Button } from '@/components/ui/button';
import { HIGHLIGHT_COLORS } from '@/lib/colors';
import { timeAgo } from '@/lib/format';
import { itemPath } from '@/lib/items';
import { navigateTo } from '@/lib/navigation';
import { itemsInFolder } from '@/lib/tree';
import type { Folder, Highlight, Item } from '@/lib/types';
import { cn } from '@/lib/utils';
import { deleteHighlight, useStore } from '@/store/store';
import { focusHighlight, useUi } from '@/store/ui';

// Highlights as Markdown: a quote per highlight, its comment underneath.
const asMarkdown = (list: Highlight[]) =>
  list.map((h) => `> ${h.quote.replace(/\n+/g, ' ')}${h.comment ? `\n\n${h.comment}` : ''}`).join('\n\n');

function copy(text: string) {
  void navigator.clipboard.writeText(text);
  toast.success('Copied as Markdown');
}

function Entry({ highlight, lost, onOpen }: { highlight: Highlight; lost?: boolean; onOpen: () => void }) {
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'hover:bg-muted/60 w-full rounded-md border-l-4 py-1.5 pr-8 pl-3 text-left',
          HIGHLIGHT_COLORS[highlight.color].border
        )}
      >
        <p className="line-clamp-4 text-sm leading-relaxed">{highlight.quote}</p>
        {highlight.comment && (
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">{highlight.comment}</p>
        )}
        <p className="text-muted-foreground mt-1 text-[11px]">
          {lost ? 'Not found in the current copy of the page' : timeAgo(highlight.createdAt)}
        </p>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Remove highlight"
        title="Remove highlight"
        onClick={() => void deleteHighlight(highlight.id)}
        className="text-muted-foreground absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function Header({ count, onCopy }: { count: number; onCopy: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 pt-3 pb-2">
      <p className="text-muted-foreground text-xs">
        {count} {count === 1 ? 'highlight' : 'highlights'}
      </p>
      <Button variant="ghost" size="sm" onClick={onCopy}>
        <Copy /> Copy all
      </Button>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 px-6 py-12 text-center text-sm">
      <Highlighter className="size-6 opacity-60" />
      {text}
    </div>
  );
}

// One item's highlights, in reading order. Picking one scrolls the reader view to it.
export function ItemHighlights({ item }: { item: Item }) {
  const list = useStore(
    useShallow((s) =>
      Object.values(s.highlights)
        .filter((h) => h.itemId === item.id)
        .sort((a, b) => a.start - b.start)
    )
  );
  const lost = useUi((s) => s.lostHighlightIds);
  if (list.length === 0) {
    return <Empty text="Select text in the reader view to highlight it and add a comment." />;
  }
  return (
    <div className="h-full overflow-y-auto pb-4">
      <Header count={list.length} onCopy={() => copy(asMarkdown(list))} />
      <ul className="flex flex-col gap-1 px-3">
        {list.map((h) => (
          <Entry key={h.id} highlight={h} lost={lost.includes(h.id)} onOpen={() => focusHighlight(h.id)} />
        ))}
      </ul>
    </div>
  );
}

// Every highlight in a folder, grouped by item in the folder's order: a recap of the session.
export function FolderHighlights({ folder }: { folder: Folder }) {
  const items = useStore((s) => s.items);
  const highlights = useStore((s) => s.highlights);
  const groups = useMemo(() => {
    const byItem = new Map<string, Highlight[]>();
    for (const h of Object.values(highlights)) byItem.set(h.itemId, [...(byItem.get(h.itemId) ?? []), h]);
    return itemsInFolder(items, folder.id, folder.view.sort ?? 'manual')
      .filter((item) => byItem.has(item.id))
      .map((item) => ({ item, list: byItem.get(item.id)!.sort((a, b) => a.start - b.start) }));
  }, [items, highlights, folder.id, folder.view.sort]);

  if (groups.length === 0) {
    return <Empty text="Highlights from this folder’s pages will gather here: open a page and select text to start." />;
  }
  const count = groups.reduce((sum, g) => sum + g.list.length, 0);
  const markdown = groups.map((g) => `## ${g.item.title}\n${g.item.url}\n\n${asMarkdown(g.list)}`).join('\n\n');
  return (
    <div className="h-full overflow-y-auto pb-4">
      <Header count={count} onCopy={() => copy(markdown)} />
      <div className="flex flex-col gap-4 px-3">
        {groups.map(({ item, list }) => (
          <section key={item.id}>
            <button
              type="button"
              onClick={() => navigateTo(itemPath(item))}
              className="hover:text-primary mb-1 flex w-full items-center gap-2 px-1 text-left text-sm font-medium"
            >
              <Favicon item={item} />
              <span className="truncate">{item.title}</span>
            </button>
            <ul className="flex flex-col gap-1">
              {list.map((h) => (
                <Entry key={h.id} highlight={h} onOpen={() => navigateTo(`${itemPath(item)}?h=${h.id}`)} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
