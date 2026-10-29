import { File, FileText, Film, Globe, Image as ImageIcon, StickyNote } from 'lucide-react';
import { formatBytes, hostOf } from '@/lib/format';
import type { FileInfo, Item, ItemKind } from '@/lib/types';
import { navigateTo } from '@/lib/navigation';

export const KIND_ICON: Record<ItemKind, typeof Globe> = {
  link: Globe,
  note: StickyNote,
  file: File,
  image: ImageIcon,
  video: Film,
  pdf: FileText,
};

// "Week 3.pdf" -> "PDF"
export const fileExtension = (name: string) => /\.([a-z0-9]{1,8})$/i.exec(name)?.[1].toUpperCase() ?? '';

// Uploads show in the browser where it can; ?download always saves.
export const fileUrl = (file: FileInfo, download = false) => `/api/files/${file.id}${download ? '?download' : ''}`;

// A note's text for previews, without its first line when that is just the title again
// (notes saved before notes had their own titles).
export function notePreview(item: Item): string {
  const text = item.notes.trim();
  const [first, ...rest] = text.split('\n');
  return first.trim() === item.title.trim() ? rest.join('\n').trim() : text;
}

// The small grey line under a card's title.
export function itemSubtitle(item: Item): string {
  if (item.kind === 'note') return 'Note';
  if (item.file) return [fileExtension(item.file.name) || 'File', formatBytes(item.file.size)].join(' · ');
  return item.siteName || hostOf(item.url);
}

export const itemPath = (item: Item) => `/s/${item.spaceId}/i/${item.id}`;

// The page or file itself, outside Linkr. Notes have none.
export function externalUrl(item: Item): string | null {
  if (item.file) return item.file.id ? fileUrl(item.file) : null;
  return item.url || null;
}

// Opens the split view: the item beside its notes.
export function openItem(item: Item) {
  if (item.file && !item.file.id) return; // still uploading
  navigateTo(itemPath(item));
}

export function openInNewTab(item: Item) {
  const url = externalUrl(item);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
