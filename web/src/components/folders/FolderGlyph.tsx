import { Folder as FolderIcon, FolderOpen } from 'lucide-react';
import { COLORS } from '@/lib/colors';
import type { Folder } from '@/lib/types';
import { cn } from '@/lib/utils';

// A folder's emoji if it has one, otherwise a folder icon in its colour.
export function FolderGlyph({
  folder,
  open,
  className,
}: {
  folder: Pick<Folder, 'icon' | 'color'>;
  open?: boolean;
  className?: string;
}) {
  if (folder.icon)
    return (
      <span
        className={cn('inline-flex size-4 shrink-0 items-center justify-center text-[0.9rem] leading-none', className)}
      >
        {folder.icon}
      </span>
    );
  const Icon = open ? FolderOpen : FolderIcon;
  return (
    <Icon
      className={cn('size-4 shrink-0', folder.color ? COLORS[folder.color].text : 'text-muted-foreground', className)}
    />
  );
}
