import DOMPurify from 'dompurify';
import { BookOpen, Download, ExternalLink, Globe, Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { videoEmbedUrl } from '@/lib/embed';
import { formatBytes } from '@/lib/format';
import { fileUrl, KIND_ICON, openInNewTab } from '@/lib/items';
import type { Item } from '@/lib/types';

export type LinkMode = 'live' | 'reader';

// Pages that allow framing open live; the rest open as their saved reader copy.
export const defaultMode = (item: Item): LinkMode => (item.frameable ? 'live' : 'reader');

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
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math'],
    FORBID_ATTR: ['style', 'class', 'id'],
  });

function Message({ item, text, children }: { item: Item; text: string; children?: ReactNode }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Icon className="text-muted-foreground/60 size-10" />
      <p className="text-muted-foreground max-w-sm text-sm">{text}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {children}
        {(item.url || item.file?.id) && (
          <Button variant="outline" size="sm" onClick={() => openInNewTab(item)}>
            <ExternalLink /> Open in new tab
          </Button>
        )}
      </div>
    </div>
  );
}

function Reader({ item, onLive }: { item: Item; onLive: () => void }) {
  const [state, setState] = useState<{ copy?: ReaderCopy; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    let cancelled = false;
    api
      .get<ReaderCopy>(`/items/${item.id}/content`)
      .then((copy) => !cancelled && setState({ copy: { ...copy, html: sanitize(copy.html) }, loading: false }))
      .catch(
        (error) =>
          !cancelled && setState({ error: error instanceof ApiError ? error.message : 'Failed', loading: false })
      );
    return () => {
      cancelled = true;
    };
    // A new fetch (e.g. after "Refresh preview") brings a new reader copy.
  }, [item.id, item.fetchStatus]);

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
  return (
    <div className="h-full overflow-y-auto">
      <article className="prose prose-sm sm:prose-base dark:prose-invert mx-auto max-w-2xl px-6 py-8">
        <p className="text-muted-foreground not-prose mb-2 text-xs">
          {item.siteName}
          {state.copy.byline && ` · ${state.copy.byline}`} · {minutes} min read
        </p>
        <h1>{item.title}</h1>
        <div dangerouslySetInnerHTML={{ __html: state.copy.html }} />
      </article>
    </div>
  );
}

// The item itself: a player, viewer, the live page or its reader copy.
export function Preview({
  item,
  mode,
  onModeChange,
}: {
  item: Item;
  mode: LinkMode;
  onModeChange: (mode: LinkMode) => void;
}) {
  const frame = 'size-full border-0 bg-white';

  if (item.file) {
    const src = fileUrl(item.file);
    const mime = item.file.mime;
    if (!item.file.id) return <Message item={item} text="Uploading…" />;
    if (mime.startsWith('image/')) {
      return (
        <div className="bg-muted/40 flex h-full items-center justify-center p-4">
          <img src={src} alt={item.title} className="max-h-full max-w-full rounded-md object-contain shadow-sm" />
        </div>
      );
    }
    if (mime.startsWith('video/')) {
      return (
        <div className="flex h-full items-center justify-center bg-black">
          <video src={src} controls className="max-h-full max-w-full" />
        </div>
      );
    }
    if (mime.startsWith('audio/')) {
      return (
        <Message item={item} text={item.file.name}>
          <audio src={src} controls className="w-72" />
        </Message>
      );
    }
    if (mime === 'application/pdf' || mime === 'text/plain') {
      return <iframe src={src} title={item.title} className={frame} />;
    }
    return (
      <Message
        item={item}
        text={`${item.file.name} · ${formatBytes(item.file.size)}. This type of file can’t be shown here.`}
      >
        <Button variant="outline" size="sm" asChild>
          <a href={fileUrl(item.file, true)} download={item.file.name}>
            <Download /> Download
          </a>
        </Button>
      </Message>
    );
  }

  const player = videoEmbedUrl(item.url);
  if (player) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <iframe
          src={player}
          title={item.title}
          className="aspect-video max-h-full w-full border-0"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  if (item.kind === 'image') {
    return (
      <div className="bg-muted/40 flex h-full items-center justify-center p-4">
        <img
          src={`/api/items/${item.id}/image`}
          alt={item.title}
          className="max-h-full max-w-full rounded-md object-contain"
        />
      </div>
    );
  }

  if (mode === 'reader' && item.kind === 'link')
    return <Reader key={item.id} item={item} onLive={() => onModeChange('live')} />;

  if (item.frameable === false) {
    return (
      <Message item={item} text={`${item.siteName || 'This site'} doesn’t allow itself to be shown inside other apps.`}>
        {item.kind === 'link' && (
          <Button variant="outline" size="sm" onClick={() => onModeChange('reader')}>
            <BookOpen /> Reader view
          </Button>
        )}
      </Message>
    );
  }
  return (
    // The spinner shows through until the page paints over it.
    <div className="relative size-full">
      <Loader2 className="text-muted-foreground absolute top-1/2 left-1/2 size-5 -translate-1/2 animate-spin" />
      <iframe
        key={item.url}
        src={item.url}
        title={item.title}
        className="relative size-full border-0"
        // The page runs in its own origin; it can't reach Linkr. Popups (its links) open normally.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
