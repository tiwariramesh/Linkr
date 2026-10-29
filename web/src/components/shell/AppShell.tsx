import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { generateKeyBetween } from 'fractional-indexing';
import { Folder as FolderIcon, Menu, Search } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import { useDragState, type DragData, type DropData, type FolderZone } from '@/components/dnd/dnd';
import { Capture } from '@/components/shell/Capture';
import { Sidebar } from '@/components/shell/Sidebar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { KIND_ICON } from '@/lib/items';
import { setNavigator } from '@/lib/navigation';
import { childFolders, isInside, itemsInFolder } from '@/lib/tree';
import { moveItems, openSpace, updateFolder, updateItem, useStore } from '@/store/store';
import { openPalette, setMobileNav, useUi } from '@/store/ui';

// Dialogs load on first use, keeping the first page load small.
const ItemDialog = lazy(() => import('@/components/items/ItemDialog').then((m) => ({ default: m.ItemDialog })));
const MoveDialog = lazy(() => import('@/components/items/MoveDialog').then((m) => ({ default: m.MoveDialog })));
const SettingsDialog = lazy(() =>
  import('@/components/settings/SettingsDialog').then((m) => ({ default: m.SettingsDialog }))
);
const RunAgainDialog = lazy(() =>
  import('@/components/folders/RunAgainDialog').then((m) => ({ default: m.RunAgainDialog }))
);
const CommandPalette = lazy(() =>
  import('@/components/shell/CommandPalette').then((m) => ({ default: m.CommandPalette }))
);

// Sidebar targets win when the pointer is over them; otherwise items sort by nearest neighbour.
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const sidebarHit = within.filter(
    (hit) => (hit.data?.droppableContainer.data.current as DropData | undefined)?.type !== 'item'
  );
  if (sidebarHit.length) return sidebarHit;
  const dragging = args.active.data.current as DragData | undefined;
  if (dragging?.type !== 'item') return within;
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => (c.data.current as DropData | undefined)?.type === 'item'
    ),
  });
};

function zoneFor(event: DragMoveEvent | DragEndEvent): FolderZone {
  const rect = event.over?.rect;
  const start = event.activatorEvent as PointerEvent | TouchEvent;
  const startY = 'touches' in start ? (start.touches[0]?.clientY ?? 0) : start.clientY;
  if (!rect) return 'inside';
  const ratio = (startY + event.delta.y - rect.top) / rect.height;
  return ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside';
}

function DragPreview() {
  const dragging = useDragState((state) => state.dragging);
  const label = useStore((state) => {
    if (!dragging) return null;
    if (dragging.type === 'folder') return state.folders[dragging.folderId]?.title;
    const count = state.selection.includes(dragging.itemId) ? state.selection.length : 1;
    const title = state.items[dragging.itemId]?.title;
    return count > 1 ? `${count} items` : title;
  });
  const kind = useStore((state) => (dragging?.type === 'item' ? state.items[dragging.itemId]?.kind : null));
  if (!dragging || !label) return null;
  const Icon = dragging.type === 'folder' ? FolderIcon : KIND_ICON[kind ?? 'link'];
  return (
    <div className="bg-popover text-popover-foreground flex max-w-64 cursor-grabbing items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-lg">
      <Icon className="text-muted-foreground size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </div>
  );
}

export function AppShell() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const spaces = useStore((state) => state.spaces);
  const mobileNavOpen = useUi((state) => state.mobileNavOpen);
  const editing = useUi((state) => state.editingItemId !== null);
  const moving = useUi((state) => state.movingItemIds !== null);
  const settingsOpen = useUi((state) => state.settingsOpen);
  const paletteOpen = useUi((state) => state.paletteOpen);
  const runningAgain = useUi((state) => state.runAgainFolderId !== null);
  // Mounted on first use, then kept so it opens instantly.
  const [paletteUsed, setPaletteUsed] = useState(false);
  if (paletteOpen && !paletteUsed) setPaletteUsed(true);

  useEffect(() => setNavigator(navigate), [navigate]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!spaceId) return;
    if (!spaces.some((space) => space.id === spaceId)) {
      navigate('/', { replace: true });
      return;
    }
    void openSpace(spaceId);
  }, [spaceId, spaces, navigate]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragStart = (event: DragStartEvent) => {
    useDragState.setState({ dragging: event.active.data.current as DragData, folderDrop: null });
  };

  const onDragMove = (event: DragMoveEvent) => {
    const drag = event.active.data.current as DragData;
    const drop = event.over?.data.current as DropData | undefined;
    if (drop?.type !== 'folder') {
      if (useDragState.getState().folderDrop) useDragState.setState({ folderDrop: null });
      return;
    }
    const zone = drag.type === 'folder' && !drop.tile ? zoneFor(event) : 'inside';
    const current = useDragState.getState().folderDrop;
    if (current?.folderId !== drop.folderId || current.zone !== zone) {
      useDragState.setState({ folderDrop: { folderId: drop.folderId, zone } });
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const drag = event.active.data.current as DragData;
    const drop = event.over?.data.current as DropData | undefined;
    useDragState.setState({ dragging: null, folderDrop: null });
    if (!drop) return;
    const { items, folders, selection } = useStore.getState();

    if (drag.type === 'item') {
      const ids = selection.includes(drag.itemId) ? selection : [drag.itemId];
      if (drop.type === 'folder') void moveItems(ids, drop.folderId);
      else if (drop.type === 'inbox') void moveItems(ids, null);
      else if (drop.type === 'item' && drop.itemId !== drag.itemId) {
        // Reorder within a folder that is sorted by hand.
        const item = items[drag.itemId];
        const target = items[drop.itemId];
        if (!item || !target || target.folderId !== item.folderId) return;
        const sort = item.folderId ? (folders[item.folderId]?.view.sort ?? 'manual') : 'manual';
        if (sort !== 'manual') return;
        const list = itemsInFolder(items, item.folderId, 'manual');
        const from = list.findIndex((i) => i.id === item.id);
        const to = list.findIndex((i) => i.id === target.id);
        const ordered = arrayMove(list, from, to);
        const position = generateKeyBetween(ordered[to - 1]?.position ?? null, ordered[to + 1]?.position ?? null);
        void updateItem(item.id, { position });
      }
      return;
    }

    // Folder dragged in the sidebar.
    const folder = folders[drag.folderId];
    if (!folder) return;
    if (drop.type === 'folder-root') {
      const siblings = childFolders(folders, null).filter((f) => f.id !== folder.id);
      void updateFolder(folder.id, {
        parentId: null,
        position: generateKeyBetween(siblings.at(-1)?.position ?? null, null),
      });
      return;
    }
    if (drop.type !== 'folder' || drop.folderId === folder.id) return;
    const target = folders[drop.folderId];
    if (!target || isInside(folders, target.id, folder.id)) return; // can't drop a folder into its own subtree
    const zone = drop.tile ? 'inside' : zoneFor(event);
    if (zone === 'inside') {
      const children = childFolders(folders, target.id).filter((f) => f.id !== folder.id);
      void updateFolder(folder.id, {
        parentId: target.id,
        position: generateKeyBetween(children.at(-1)?.position ?? null, null),
      });
      return;
    }
    const siblings = childFolders(folders, target.parentId).filter((f) => f.id !== folder.id);
    const index = siblings.findIndex((f) => f.id === target.id);
    const [before, after] =
      zone === 'before' ? [siblings[index - 1], siblings[index]] : [siblings[index], siblings[index + 1]];
    void updateFolder(folder.id, {
      parentId: target.parentId,
      position: generateKeyBetween(before?.position ?? null, after?.position ?? null),
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => useDragState.setState({ dragging: null, folderDrop: null })}
    >
      <div className="flex h-svh overflow-hidden">
        <aside className="bg-sidebar hidden w-64 shrink-0 border-r md:flex">
          <Sidebar />
        </aside>
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNav}>
          <SheetContent side="left" className="bg-sidebar w-72 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar />
          </SheetContent>
        </Sheet>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileNav(true)} aria-label="Open navigation">
              <Menu />
            </Button>
            <img src="/logo.svg" alt="" className="size-5" />
            <span className="flex-1 font-semibold">Linkr</span>
            <Button variant="ghost" size="icon" onClick={() => openPalette(true)} aria-label="Search">
              <Search />
            </Button>
          </div>
          <Outlet />
        </main>
      </div>
      <DragOverlay dropAnimation={null}>
        <DragPreview />
      </DragOverlay>
      <Suspense>
        {editing && <ItemDialog />}
        {moving && <MoveDialog />}
        {settingsOpen && <SettingsDialog />}
        {paletteUsed && <CommandPalette />}
        {runningAgain && <RunAgainDialog />}
      </Suspense>
      <Capture />
    </DndContext>
  );
}
