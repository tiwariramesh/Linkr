import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { DragData } from '@/components/dnd/dnd';
import { Favicon, ItemMenu, ItemThumb, TagChips } from '@/components/items/ItemParts';
import { openItem } from '@/lib/items';
import { hostOf, timeAgo } from '@/lib/format';
import type { Item } from '@/lib/types';
import { cn } from '@/lib/utils';
import { toggleSelected, useStore } from '@/store/store';

type Layout = 'cards' | 'list';

function SelectBox({ item, selected }: { item: Item; selected: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`Select ${item.title}`}
      onClick={(event) => {
        event.stopPropagation();
        toggleSelected(item.id);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'flex size-5 items-center justify-center rounded border shadow-sm transition',
        selected
          ? 'bg-primary border-primary text-primary-foreground'
          : 'bg-background/90 opacity-0 group-hover:opacity-100'
      )}
    >
      {selected && <Check className="size-3.5" />}
    </button>
  );
}

function SortableItem({
  item,
  layout,
  reorderable,
  selecting,
}: {
  item: Item;
  layout: Layout;
  reorderable: boolean;
  selecting: boolean;
}) {
  const selected = useStore((state) => state.selection.includes(item.id));
  const data: DragData = { type: 'item', itemId: item.id };
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
    data,
    disabled: { droppable: !reorderable },
  });

  // Plain click opens; Ctrl/Cmd/Shift-click (or any click while selecting) selects.
  const onClick = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || selecting) toggleSelected(item.id);
    else openItem(item);
  };

  const style = { transform: CSS.Translate.toString(transform), transition };
  const host = item.siteName || hostOf(item.url);

  if (layout === 'list') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={onClick}
        className={cn(
          'group hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 outline-none',
          selected && 'bg-primary/5 ring-primary/30 ring-1',
          isDragging && 'opacity-40'
        )}
      >
        <SelectBox item={item} selected={selected} />
        <Favicon item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {item.kind === 'note' ? item.notes.split('\n').slice(1).join(' ') || 'Note' : host}
          </p>
        </div>
        <div className="hidden sm:block">
          <TagChips item={item} max={2} />
        </div>
        <span className="text-muted-foreground hidden w-24 shrink-0 text-right text-xs md:block">
          {timeAgo(item.createdAt)}
        </span>
        <ItemMenu item={item} className="opacity-0 group-hover:opacity-100 aria-expanded:opacity-100" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'group bg-card relative flex cursor-pointer flex-col overflow-hidden rounded-xl border outline-none transition-shadow hover:shadow-md',
        selected && 'ring-primary ring-2',
        isDragging && 'opacity-40'
      )}
    >
      <ItemThumb item={item} className="aspect-[16/9]" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {item.kind !== 'note' && <p className="line-clamp-2 text-sm leading-snug font-medium">{item.title}</p>}
        {item.kind === 'note' && item.notes.includes('\n') && (
          <p className="truncate text-sm font-medium">{item.title}</p>
        )}
        <TagChips item={item} />
        <div className="text-muted-foreground mt-auto flex items-center gap-1.5 pt-1 text-xs">
          <Favicon item={item} className="size-3.5" />
          <span className="truncate">{item.kind === 'note' ? 'Note' : host}</span>
          <span className="shrink-0">· {timeAgo(item.createdAt)}</span>
        </div>
      </div>
      <div className="absolute top-2 left-2">
        <SelectBox item={item} selected={selected} />
      </div>
      <ItemMenu
        item={item}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 aria-expanded:opacity-100"
      />
    </div>
  );
}

export function ItemsView({ items, layout, reorderable }: { items: Item[]; layout: Layout; reorderable: boolean }) {
  const selecting = useStore((state) => state.selection.length > 0);
  return (
    <SortableContext
      items={items.map((item) => item.id)}
      strategy={layout === 'cards' ? rectSortingStrategy : verticalListSortingStrategy}
    >
      <div
        className={layout === 'cards' ? 'grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4' : 'flex flex-col'}
      >
        {items.map((item) => (
          <SortableItem key={item.id} item={item} layout={layout} reorderable={reorderable} selecting={selecting} />
        ))}
      </div>
    </SortableContext>
  );
}
