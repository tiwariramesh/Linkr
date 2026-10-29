import { CalendarDays, ExternalLink, File as FileIcon, Play } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { COLORS } from '@/lib/colors';
import { COVER_GRADIENTS } from '@/lib/covers';
import { formatBytes, formatSessionDate } from '@/lib/format';
import { KIND_ICON } from '@/lib/items';
import type { ColorName, FileInfo, ItemKind } from '@/lib/types';
import { cn } from '@/lib/utils';

// The notes editor is large; load it only when the page has notes to show.
const BlockView = lazy(() => import('@/components/editor/BlockEditor').then((m) => ({ default: m.BlockView })));

type PublicItem = {
  id: string;
  kind: ItemKind;
  title: string;
  url: string;
  description: string;
  siteName: string;
  favicon: string;
  hasImage: boolean;
  notes: string;
  body: string | null;
  file: FileInfo | null;
};
type PublicFolder = {
  title: string;
  description: string;
  cover: string | null;
  icon: string | null;
  color: ColorName | null;
  sessionDate: string | null;
  term: string | null;
  notes: { body: string | null; text: string } | null;
};

function Item({ token, item }: { token: string; item: PublicItem }) {
  const Icon = KIND_ICON[item.kind];
  if (item.kind === 'note') {
    return (
      <article className="rounded-xl border p-5">
        <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
        <Suspense fallback={<p className="text-muted-foreground text-sm whitespace-pre-line">{item.notes}</p>}>
          <BlockView body={item.body} fallbackText={item.notes} className="bn-compact" />
        </Suspense>
      </article>
    );
  }
  if (item.file) {
    return (
      <a
        href={`/api/public/${token}/files/${item.file.id}`}
        target="_blank"
        rel="noopener"
        className="hover:bg-muted/50 flex items-center gap-4 rounded-xl border p-4 transition"
      >
        <span className="bg-muted flex size-12 shrink-0 items-center justify-center rounded-lg">
          <FileIcon className="text-muted-foreground size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.title}</span>
          <span className="text-muted-foreground text-sm">
            {item.file.name} · {formatBytes(item.file.size)}
          </span>
        </span>
      </a>
    );
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:bg-muted/50 flex gap-4 overflow-hidden rounded-xl border transition"
    >
      <span className="bg-muted relative flex w-32 shrink-0 items-center justify-center sm:w-44">
        {item.hasImage ? (
          <img
            src={`/api/public/${token}/items/${item.id}/image`}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <Icon className="text-muted-foreground/60 size-7" />
        )}
        {item.kind === 'video' && (
          <span className="absolute flex size-9 items-center justify-center rounded-full bg-black/60 text-white">
            <Play className="size-4 fill-current" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 py-3 pr-4">
        <span className="line-clamp-2 font-medium">{item.title}</span>
        {item.description && (
          <span className="text-muted-foreground mt-1 line-clamp-2 text-sm">{item.description}</span>
        )}
        <span className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs">
          {item.favicon && <img src={item.favicon} alt="" className="size-3.5" referrerPolicy="no-referrer" />}
          {item.siteName}
          <ExternalLink className="size-3" />
        </span>
      </span>
    </a>
  );
}

// A folder shared with a link: read-only, no account needed. Pages ask search engines not to index them.
export function PublicPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<{ folder: PublicFolder; items: PublicItem[] } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.append(robots);
    let cancelled = false;
    fetch(`/api/public/${encodeURIComponent(token)}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('missing'))))
      .then((result) => {
        if (cancelled) return;
        setData(result);
        document.title = `${result.folder.title} · Linkr`;
      })
      .catch(() => !cancelled && setMissing(true));
    return () => {
      cancelled = true;
      robots.remove();
    };
  }, [token]);

  if (missing) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <img src="/logo.svg" alt="" className="size-10" />
        <p className="text-lg font-semibold">This link isn’t shared any more</p>
        <p className="text-muted-foreground text-sm">Ask the person who sent it for a new one.</p>
      </div>
    );
  }
  if (!data) return <div className="min-h-svh" />;

  const { folder, items } = data;
  const cover = folder.cover?.startsWith('upload:')
    ? `center / cover no-repeat url("/api/public/${token}/cover")`
    : folder.cover
      ? COVER_GRADIENTS[folder.cover.slice('gradient:'.length)]
      : null;

  return (
    <div className="bg-background min-h-svh">
      {cover && <div className="h-40 w-full sm:h-56" style={{ background: cover }} />}
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pb-16 sm:px-6">
        <header className={cn('flex flex-col gap-2', cover ? '-mt-8' : 'pt-12')}>
          <span
            className={cn(
              'bg-background flex size-16 items-center justify-center rounded-2xl text-4xl shadow-sm ring-4 ring-[var(--background)]',
              folder.color && COLORS[folder.color].soft
            )}
          >
            {folder.icon ?? <img src="/logo.svg" alt="" className="size-8" />}
          </span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{folder.title}</h1>
          {folder.description && <p className="text-muted-foreground text-lg">{folder.description}</p>}
          {(folder.sessionDate || folder.term) && (
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <CalendarDays className="size-4" />
              {folder.sessionDate && formatSessionDate(folder.sessionDate)}
              {folder.term && (
                <span className="bg-muted text-foreground rounded px-1.5 py-0.5 text-xs font-medium">
                  {folder.term}
                </span>
              )}
            </p>
          )}
        </header>

        {folder.notes && folder.notes.text.trim() && (
          <section>
            <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Session notes</h2>
            <Suspense fallback={<p className="text-sm whitespace-pre-line">{folder.notes.text}</p>}>
              <BlockView body={folder.notes.body} fallbackText={folder.notes.text} className="bn-compact" />
            </Suspense>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {items.length} {items.length === 1 ? 'resource' : 'resources'}
          </h2>
          {items.map((item) => (
            <Item key={item.id} token={token} item={item} />
          ))}
        </section>

        <footer className="text-muted-foreground flex items-center justify-center gap-2 border-t pt-6 text-xs">
          <img src="/logo.svg" alt="" className="size-4" /> Shared with Linkr
        </footer>
      </main>
    </div>
  );
}
