import {
  Copy,
  ExternalLink,
  FolderInput,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { COLORS } from '@/lib/colors';
import { KIND_ICON, openItem } from '@/lib/items';
import type { Item } from '@/lib/types';
import { cn } from '@/lib/utils';
import { refetchItem, trashItems, useStore } from '@/store/store';
import { askMoveItems, editItem } from '@/store/ui';

export function Favicon({ item, className }: { item: Item; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = KIND_ICON[item.kind];
  if (!item.favicon || failed) return <Icon className={cn('text-muted-foreground size-4 shrink-0', className)} />;
  return (
    <img
      src={item.favicon}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn('size-4 shrink-0 rounded-sm', className)}
    />
  );
}

// Preview area of a card: the page's image, a note's text, or a tinted placeholder.
export function ItemThumb({ item, className }: { item: Item; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = KIND_ICON[item.kind];

  if (item.kind === 'note') {
    return (
      <div
        className={cn(
          'bg-amber-50 p-3 text-sm leading-relaxed text-amber-950/80 dark:bg-amber-950/30 dark:text-amber-100/80',
          className
        )}
      >
        <p className="line-clamp-5 whitespace-pre-line">{item.notes || item.title}</p>
      </div>
    );
  }

  const showImage = item.image && !failed;
  return (
    <div
      className={cn(
        'bg-muted relative flex items-center justify-center overflow-hidden',
        item.color && COLORS[item.color].soft,
        className
      )}
    >
      {showImage ? (
        <img
          src={`/api/items/${item.id}/image?v=${encodeURIComponent(item.updatedAt)}`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : item.fetchStatus === 'pending' ? (
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      ) : (
        <Icon className="text-muted-foreground/60 size-8" />
      )}
      {item.kind === 'video' && showImage && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/60 text-white">
            <Play className="size-5 fill-current" />
          </span>
        </span>
      )}
      {item.kind === 'pdf' && (
        <span className="absolute top-2 left-2 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          PDF
        </span>
      )}
    </div>
  );
}

export function TagChips({ item, max = 3 }: { item: Item; max?: number }) {
  const tags = useStore(useShallow((state) => item.tagIds.map((id) => state.tags[id]).filter(Boolean)));
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((tag) => (
        <span key={tag.id} className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[11px] font-medium">
          #{tag.title}
        </span>
      ))}
      {tags.length > max && <span className="text-muted-foreground text-[11px]">+{tags.length - max}</span>}
    </div>
  );
}

export function ItemMenu({ item, className }: { item: Item; className?: string }) {
  const selection = useStore((state) => state.selection);
  const ids = selection.includes(item.id) ? selection : [item.id];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Options for ${item.title}`}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          className={cn(
            'bg-background/90 hover:bg-background text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-md border shadow-sm backdrop-blur',
            className
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(event) => event.stopPropagation()}>
        {item.url && (
          <DropdownMenuItem onSelect={() => openItem(item)}>
            <ExternalLink /> Open link
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => editItem(item.id)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => askMoveItems(ids)}>
          <FolderInput /> Move to…
        </DropdownMenuItem>
        {item.url && (
          <>
            <DropdownMenuItem
              onSelect={() => {
                void navigator.clipboard.writeText(item.url);
                toast.success('Link copied');
              }}
            >
              <Copy /> Copy link
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => refetchItem(item.id)}>
              <RefreshCw /> Refresh preview
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => trashItems(ids)}>
          <Trash2 /> {ids.length > 1 ? `Move ${ids.length} to Trash` : 'Move to Trash'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
