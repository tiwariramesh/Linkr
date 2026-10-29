import { ArchiveRestore, Inbox, LayoutGrid, List, Search, Undo2, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { FolderHeader } from '@/components/folders/FolderHeader';
import { FolderHighlights } from '@/components/highlights/HighlightList';
import { QuickAdd, SelectionBar, SubfolderTiles } from '@/components/folders/FolderPageParts';
import { ItemsView } from '@/components/items/ItemsView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { readInboxView, saveInboxView } from '@/lib/inbox-view';
import { childFolders, folderStatus, itemCounts, itemsInFolder } from '@/lib/tree';
import type { FolderView, Item, SortMode, Tag } from '@/lib/types';
import { cn } from '@/lib/utils';
import { restoreFolder, setSelection, updateFolder, useStore } from '@/store/store';
import { showSessionNotes, useUi } from '@/store/ui';

// The editor is large; it loads the first time notes are opened.
const SessionNotes = lazy(() => import('@/components/editor/Notes').then((m) => ({ default: m.SessionNotes })));

const SORT_LABELS: Record<SortMode, string> = {
  manual: 'Custom order',
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Title A–Z',
};

function matches(item: Item, tags: Record<string, Tag>, query: string) {
  const q = query.toLowerCase();
  return (
    item.title.toLowerCase().includes(q) ||
    item.url.toLowerCase().includes(q) ||
    item.notes.toLowerCase().includes(q) ||
    item.description.toLowerCase().includes(q) ||
    item.tagIds.some((id) => tags[id]?.title.toLowerCase().includes(q.replace(/^#/, '')))
  );
}

// A fresh page per folder, so search text and selection never carry over.
export function FolderPage() {
  const { folderId } = useParams();
  return <FolderContents key={folderId ?? 'inbox'} />;
}

function FolderContents() {
  const { spaceId, folderId = null } = useParams();
  const ready = useStore((state) => state.spaceId === spaceId && !state.loading);
  const folder = useStore((state) => (folderId ? state.folders[folderId] : undefined));
  const status = useStore((state) =>
    folderId && state.folders[folderId] ? folderStatus(state.folders, folderId) : 'active'
  );
  const subfolders = useStore(useShallow((state) => childFolders(state.folders, folderId)));
  const allItems = useStore((state) => state.items);
  const tags = useStore((state) => state.tags);
  const notesOpen = useUi((state) => state.sessionNotesOpen);
  const [panelTab, setPanelTab] = useState<'notes' | 'highlights'>('notes');
  const [inboxView, setInboxView] = useState(readInboxView);
  const [query, setQuery] = useState('');

  const view = folderId ? (folder?.view ?? {}) : inboxView;
  const layout = view.layout ?? 'cards';
  const sort = view.sort ?? 'manual';

  const counts = useMemo(() => itemCounts(allItems), [allItems]);
  const items = useMemo(() => {
    const list = itemsInFolder(allItems, folderId, sort);
    return query.trim() ? list.filter((item) => matches(item, tags, query.trim())) : list;
  }, [allItems, folderId, sort, query, tags]);

  // Selection belongs to the folder on screen; Escape clears it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection([]);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      setSelection([]);
    };
  }, []);

  const changeView = (patch: FolderView) => {
    if (folderId) {
      void updateFolder(folderId, { view: patch });
    } else {
      const next = { ...inboxView, ...patch };
      setInboxView(next);
      saveInboxView(next);
    }
  };

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (folderId && !folder) {
    return <div className="text-muted-foreground p-10 text-center">This folder doesn’t exist any more.</div>;
  }

  const readOnly = status === 'trashed';
  const showNotes = !!folder && notesOpen && !readOnly;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 pb-24 sm:p-6">
          {status === 'trashed' && folder && (
            <div className="bg-destructive/10 text-destructive flex items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm">
              This folder is in the Trash.
              <Button size="sm" variant="outline" onClick={() => restoreFolder(folder.id)}>
                <Undo2 /> Restore
              </Button>
            </div>
          )}
          {status === 'archived' && folder && (
            <div className="bg-muted flex items-center justify-between gap-3 rounded-lg px-4 py-2 text-sm">
              This folder is archived. It stays searchable but out of the sidebar.
              {folder.archivedAt && (
                <Button size="sm" variant="outline" onClick={() => updateFolder(folder.id, { archived: false })}>
                  <ArchiveRestore /> Unarchive
                </Button>
              )}
            </div>
          )}

          {folder ? (
            <FolderHeader folder={folder} />
          ) : (
            <div className="flex items-center gap-3">
              <span className="bg-muted flex size-11 items-center justify-center rounded-xl">
                <Inbox className="size-5" />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
                <p className="text-muted-foreground text-sm">
                  Everything you save lands here first. Drag it into a folder when you’re ready.
                </p>
              </div>
            </div>
          )}

          {folder && !readOnly && (subfolders.length > 0 || items.length === 0) && (
            <SubfolderTiles parent={folder} folders={subfolders} counts={counts} />
          )}

          {!readOnly && <QuickAdd folderId={folderId} />}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-40 flex-1 sm:max-w-xs">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this folder"
                className="pl-8"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Select value={sort} onValueChange={(value) => changeView({ sort: value as SortMode })}>
                <SelectTrigger size="sm" className="w-36" aria-label="Sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {SORT_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={layout}
                onValueChange={(value) => value && changeView({ layout: value as 'cards' | 'list' })}
              >
                <ToggleGroupItem value="cards" aria-label="Cards">
                  <LayoutGrid />
                </ToggleGroupItem>
                <ToggleGroupItem value="list" aria-label="List">
                  <List />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {items.length > 0 ? (
            <ItemsView items={items} layout={layout} reorderable={sort === 'manual' && !query.trim() && !readOnly} />
          ) : (
            <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
              {query.trim()
                ? 'Nothing matches your search.'
                : folderId
                  ? 'No items yet. Paste a link above, or drag items onto this folder in the sidebar.'
                  : 'Your Inbox is empty. Paste a link above to save it.'}
            </div>
          )}
        </div>
        <SelectionBar />
      </div>
      {showNotes && (
        // Beside the items on wide screens; over them on small ones.
        <aside className="bg-background fixed inset-0 z-40 flex flex-col lg:static lg:z-auto lg:w-[420px] lg:shrink-0 lg:border-l">
          <div className="flex items-center justify-between border-b pr-1 pl-2">
            <div className="flex gap-1 pt-2" role="tablist">
              {(['notes', 'highlights'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={panelTab === tab}
                  onClick={() => setPanelTab(tab)}
                  className={cn(
                    '-mb-px border-b-2 px-3 pb-2 text-sm font-medium',
                    panelTab === tab
                      ? 'border-primary text-foreground'
                      : 'text-muted-foreground hover:text-foreground border-transparent'
                  )}
                >
                  {tab === 'notes' ? 'Session notes' : 'Highlights'}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => showSessionNotes(false)} aria-label="Close notes">
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {panelTab === 'notes' ? (
              <Suspense>
                <SessionNotes folder={folder} />
              </Suspense>
            ) : (
              <FolderHighlights folder={folder} />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
