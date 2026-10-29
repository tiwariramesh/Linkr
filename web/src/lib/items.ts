import { File, FileText, Film, Globe, Image as ImageIcon, StickyNote } from 'lucide-react';
import { formatBytes, hostOf } from '@/lib/format';
import type { FileInfo, Item, ItemKind } from '@/lib/types';
import { editItem } from '@/store/ui';

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

// The small grey line under a card's title.
export function itemSubtitle(item: Item): string {
  if (item.kind === 'note') return 'Note';
  if (item.file) return [fileExtension(item.file.name) || 'File', formatBytes(item.file.size)].join(' · ');
  return item.siteName || hostOf(item.url);
}

// Links and files open in a new tab; notes open in the editor.
export function openItem(item: Item) {
  if (item.file) {
    // An empty id means it is still uploading.
    if (item.file.id) window.open(fileUrl(item.file), '_blank', 'noopener');
  } else if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
  else editItem(item.id);
}
