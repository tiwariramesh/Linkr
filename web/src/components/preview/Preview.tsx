import { BookOpen, Download, Loader2 } from 'lucide-react';
import { Message } from '@/components/preview/Message';
import { Reader } from '@/components/preview/Reader';
import { Button } from '@/components/ui/button';
import { videoEmbedUrl } from '@/lib/embed';
import { formatBytes } from '@/lib/format';
import { fileUrl } from '@/lib/items';
import type { Item } from '@/lib/types';

export type LinkMode = 'live' | 'reader';

// Pages that allow framing open live; the rest open as their saved reader copy.
export const defaultMode = (item: Item): LinkMode => (item.frameable ? 'live' : 'reader');

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
