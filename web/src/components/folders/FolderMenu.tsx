import {
  Archive,
  ArchiveRestore,
  Ban,
  FolderPlus,
  Palette,
  Pencil,
  Presentation,
  Repeat,
  Smile,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { COLOR_NAMES, COLORS, FOLDER_ICONS } from '@/lib/colors';
import type { Folder } from '@/lib/types';
import { cn } from '@/lib/utils';
import { createFolder, trashFolder, updateFolder } from '@/store/store';
import { startPresenting } from '@/lib/present';
import { askRunAgain, focusFolderTitle, setExpanded } from '@/store/ui';

// The same actions appear in the "…" menu and the right-click menu; each passes in its own menu parts.
type MenuParts = {
  Item: ComponentType<{
    onSelect?: () => void;
    className?: string;
    children: ReactNode;
    variant?: 'default' | 'destructive';
  }>;
  Separator: ComponentType;
  Sub: ComponentType<{ children: ReactNode }>;
  SubTrigger: ComponentType<{ children: ReactNode }>;
  SubContent: ComponentType<{ className?: string; children: ReactNode }>;
};

export function FolderMenuItems({
  folder,
  parts,
  onRename,
}: {
  folder: Folder;
  parts: MenuParts;
  onRename?: () => void;
}) {
  const navigate = useNavigate();
  const { Item, Separator, Sub, SubTrigger, SubContent } = parts;

  const addSubfolder = async () => {
    setExpanded(folder.id, true);
    const child = await createFolder({ parentId: folder.id, title: 'Untitled folder' });
    if (child) {
      focusFolderTitle(child.id);
      navigate(`/s/${folder.spaceId}/f/${child.id}`);
    }
  };

  return (
    <>
      <Item onSelect={addSubfolder}>
        <FolderPlus /> New subfolder
      </Item>
      {onRename && (
        <Item onSelect={onRename}>
          <Pencil /> Rename
        </Item>
      )}
      <Sub>
        <SubTrigger>
          <Palette /> Colour
        </SubTrigger>
        <SubContent className="grid grid-cols-5 gap-1 p-2">
          {COLOR_NAMES.map((color) => (
            <Item key={color} onSelect={() => updateFolder(folder.id, { color })} className="justify-center p-1.5">
              <span
                title={COLORS[color].label}
                className={cn(
                  'size-4 rounded-full',
                  COLORS[color].dot,
                  folder.color === color && 'ring-foreground ring-2 ring-offset-2 ring-offset-transparent'
                )}
              />
            </Item>
          ))}
          <Item onSelect={() => updateFolder(folder.id, { color: null })} className="col-span-5 justify-center text-xs">
            <Ban /> No colour
          </Item>
        </SubContent>
      </Sub>
      <Sub>
        <SubTrigger>
          <Smile /> Icon
        </SubTrigger>
        <SubContent className="grid grid-cols-6 gap-0.5 p-2">
          {FOLDER_ICONS.map((icon) => (
            <Item
              key={icon}
              onSelect={() => updateFolder(folder.id, { icon })}
              className="justify-center p-1 text-base"
            >
              {icon}
            </Item>
          ))}
          <Item onSelect={() => updateFolder(folder.id, { icon: null })} className="col-span-6 justify-center text-xs">
            <Ban /> No icon
          </Item>
        </SubContent>
      </Sub>
      <Item onSelect={() => updateFolder(folder.id, { pinned: !folder.pinned })}>
        {folder.pinned ? (
          <>
            <StarOff /> Remove from favourites
          </>
        ) : (
          <>
            <Star /> Add to favourites
          </>
        )}
      </Item>
      <Separator />
      <Item onSelect={() => startPresenting(folder.spaceId, folder.id)}>
        <Presentation /> Present
      </Item>
      <Item onSelect={() => askRunAgain(folder.id)}>
        <Repeat /> Run again…
      </Item>
      <Separator />
      <Item onSelect={() => updateFolder(folder.id, { archived: !folder.archivedAt })}>
        {folder.archivedAt ? (
          <>
            <ArchiveRestore /> Unarchive
          </>
        ) : (
          <>
            <Archive /> Archive
          </>
        )}
      </Item>
      <Item variant="destructive" onSelect={() => trashFolder(folder.id)}>
        <Trash2 /> Move to Trash
      </Item>
    </>
  );
}
