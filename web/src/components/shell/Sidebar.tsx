import { useDroppable } from '@dnd-kit/core';
import {
  Archive,
  Check,
  ChevronsUpDown,
  Import,
  Inbox,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { useDragState, type DropData } from '@/components/dnd/dnd';
import { FolderGlyph } from '@/components/folders/FolderGlyph';
import { FolderTree } from '@/components/shell/FolderTree';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { setTheme, useTheme, type Theme } from '@/lib/theme';
import { folderStatus, itemCounts } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { createFolder, createSpace, logout, useCanEdit, useStore } from '@/store/store';
import { NotificationsBell } from '@/components/sharing/NotificationsBell';
import { focusFolderTitle, openPalette, openSettings, openSpaceSettings, setMobileNav } from '@/store/ui';

function NavItem({
  to,
  icon,
  label,
  count,
  end,
  dropRef,
  highlight,
  dropFolder,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  count?: number;
  end?: boolean;
  dropRef?: (node: HTMLElement | null) => void;
  highlight?: boolean;
  // Files and links dragged in from outside the app land in this folder ('' = Inbox).
  dropFolder?: string;
}) {
  return (
    <NavLink
      ref={dropRef}
      to={to}
      end={end}
      data-drop-folder={dropFolder}
      onClick={() => setMobileNav(false)}
      className={({ isActive }) =>
        cn(
          'data-[file-over]:bg-primary/10 data-[file-over]:ring-primary flex h-8 items-center gap-2 rounded-md px-2 text-sm data-[file-over]:ring-2',
          isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'hover:bg-sidebar-accent/60',
          highlight && 'bg-primary/10 ring-primary/40 ring-1'
        )
      }
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {count ? <span className="text-muted-foreground text-xs tabular-nums">{count}</span> : null}
    </NavLink>
  );
}

function SpaceSwitcher() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const spaces = useStore((state) => state.spaces);
  const current = spaces.find((space) => space.id === spaceId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const submit = async () => {
    if (!name.trim()) return;
    const space = await createSpace(name.trim());
    setCreating(false);
    setName('');
    if (space) navigate(`/s/${space.id}`);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="hover:bg-sidebar-accent/60 flex w-full items-center gap-2 rounded-lg p-2 text-left"
          >
            <img src="/logo.svg" alt="" className="size-7 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{current?.name ?? 'Linkr'}</span>
              <span className="text-muted-foreground block text-xs">
                {current?.kind === 'team'
                  ? current.role === 'viewer'
                    ? 'Shared space · view only'
                    : 'Shared space'
                  : 'Personal space'}
              </span>
            </span>
            <ChevronsUpDown className="text-muted-foreground size-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Spaces</DropdownMenuLabel>
          {spaces.map((space) => (
            <DropdownMenuItem key={space.id} onSelect={() => navigate(`/s/${space.id}`)}>
              <span className="flex size-5 items-center justify-center rounded bg-orange-500/15 text-xs font-semibold text-orange-600">
                {space.icon ?? space.name[0]?.toUpperCase()}
              </span>
              <span className="flex-1 truncate">{space.name}</span>
              {space.id === spaceId && <Check className="size-4" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openSpaceSettings(true)}>
            <Users /> {current?.kind === 'team' ? 'People and settings' : 'Share with others…'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus /> New shared space
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New shared space</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            A separate place with its own folders and tags, e.g. for a course, team or department. Invite people to it
            once it’s made.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Input
              autoFocus
              placeholder="e.g. AI for Teachers"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={!name.trim()}>
                Create space
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserMenu() {
  const user = useStore((state) => state.user);
  const theme = useTheme((state) => state.theme);
  const themes: [Theme, string, ReactNode][] = [
    ['light', 'Light', <Sun key="l" />],
    ['dark', 'Dark', <Moon key="d" />],
    ['system', 'System', <Monitor key="s" />],
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-sidebar-accent/60 flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm"
        >
          <span className="bg-muted flex size-7 items-center justify-center rounded-full">
            <UserRound className="size-4" />
          </span>
          <span className="flex-1 truncate font-medium">{user?.username}</span>
          <Settings className="text-muted-foreground size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="truncate font-normal">{user?.email}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => openSettings('account')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openSettings('import')}>
          <Import /> Import bookmarks
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {themes.map(([value, label, icon]) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            {icon} {label}
            {theme === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar() {
  const { spaceId } = useParams();
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const items = useStore((state) => state.items);
  const counts = useMemo(() => itemCounts(items), [items]);
  const favourites = useStore(
    useShallow((state) =>
      Object.values(state.folders)
        .filter((folder) => folder.pinned && folderStatus(state.folders, folder.id) === 'active')
        .sort((a, b) => a.title.localeCompare(b.title))
    )
  );
  const trashCount = useStore(
    (state) =>
      Object.values(state.items).filter((item) => item.deletedAt).length +
      Object.values(state.folders).filter((folder) => folder.deletedAt).length
  );
  const dragging = useDragState((state) => state.dragging);

  const inboxDrop = useDroppable({ id: 'inbox', data: { type: 'inbox' } satisfies DropData });
  const { setNodeRef: setRootDropRef, isOver: overRoot } = useDroppable({
    id: 'folder-root',
    data: { type: 'folder-root' } satisfies DropData,
  });

  const newFolder = async () => {
    const folder = await createFolder({ parentId: null, title: 'Untitled folder' });
    if (folder) {
      focusFolderTitle(folder.id);
      setMobileNav(false);
      navigate(`/s/${folder.spaceId}/f/${folder.id}`);
    }
  };

  if (!spaceId) return null;
  const base = `/s/${spaceId}`;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex flex-col gap-1 p-2">
        <SpaceSwitcher />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setMobileNav(false);
              openPalette(true);
            }}
            className="text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60 flex h-8 flex-1 items-center gap-2 rounded-md px-2 text-sm"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="bg-background rounded border px-1.5 font-sans text-[10px] font-medium">
              {/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
          <NotificationsBell />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <nav className="flex flex-col gap-0.5 px-2 pb-4">
          <NavItem
            to={base}
            end
            icon={<Inbox className="size-4" />}
            label="Inbox"
            count={counts.get('')}
            dropRef={inboxDrop.setNodeRef}
            highlight={inboxDrop.isOver && dragging?.type === 'item'}
            dropFolder=""
          />

          {favourites.length > 0 && (
            <>
              <p className="text-muted-foreground mt-4 mb-1 px-2 text-xs font-medium">Favourites</p>
              {favourites.map((folder) => (
                <NavItem
                  key={folder.id}
                  to={`${base}/f/${folder.id}`}
                  icon={<FolderGlyph folder={folder} />}
                  label={folder.title}
                  dropFolder={folder.id}
                />
              ))}
            </>
          )}

          <div className="group/folders mt-4 mb-1 flex items-center justify-between px-2">
            <p className="text-muted-foreground text-xs font-medium">Folders</p>
            {canEdit && (
              <Button variant="ghost" size="icon-xs" onClick={newFolder} aria-label="New folder" title="New folder">
                <Plus />
              </Button>
            )}
          </div>
          <FolderTree counts={counts} />
          <div
            ref={setRootDropRef}
            className={cn(
              'text-muted-foreground mt-1 rounded-md border border-dashed border-transparent px-2 py-1.5 text-xs',
              dragging?.type === 'folder' && 'border-border',
              overRoot && dragging?.type === 'folder' && 'border-primary/50 bg-primary/5'
            )}
          >
            {dragging?.type === 'folder'
              ? 'Drop here to move to the top level'
              : canEdit && (
                  <button type="button" onClick={newFolder} className="hover:text-foreground flex items-center gap-1.5">
                    <Plus className="size-3.5" /> New folder
                  </button>
                )}
          </div>

          <div className="mt-4 flex flex-col gap-0.5">
            <NavItem to={`${base}/archive`} icon={<Archive className="size-4" />} label="Archive" />
            <NavItem to={`${base}/trash`} icon={<Trash2 className="size-4" />} label="Trash" count={trashCount} />
          </div>
        </nav>
      </ScrollArea>
      <div className="border-t p-2">
        <UserMenu />
      </div>
    </div>
  );
}
