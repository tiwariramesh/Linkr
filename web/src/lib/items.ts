import { FileText, Film, Globe, Image as ImageIcon, StickyNote } from 'lucide-react';
import type { Item, ItemKind } from '@/lib/types';
import { editItem } from '@/store/ui';

export const KIND_ICON: Record<ItemKind, typeof Globe> = {
  link: Globe,
  note: StickyNote,
  file: FileText,
  image: ImageIcon,
  video: Film,
  pdf: FileText,
};

// Links open in a new tab; notes open in the editor.
export function openItem(item: Item) {
  if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
  else editItem(item.id);
}
