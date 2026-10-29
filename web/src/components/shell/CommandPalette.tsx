import {
  Archive,
  FolderPlus,
  Import,
  Inbox,
  Link2,
  Monitor,
  Moon,
  Paperclip,
  Repeat,
  Settings,
  StickyNote,
  Sun,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { FolderGlyph } from '@/components/folders/FolderGlyph';
import { Favicon } from '@/components/items/ItemParts';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { api } from '@/lib/api';
import { extractUrls, formatSessionDate } from '@/lib/format';
import { itemSubtitle, openItem } from '@/lib/items';
import { setTheme } from '@/lib/theme';
import { folderPath, folderStatus } from '@/lib/tree';
import type { Folder, Item, SearchHit } from '@/lib/types';
import { addFromText, createFolder, useStore } from '@/store/store';
import { focusFolderTitle, openPalette, openSettings, showSessionNotes, useUi } from '@/store/ui';
import { pickFiles } from '@/store/uploads';

type Action = { id: string; label: string; keywords?: string; icon: ReactNode; run: () => void };

const words = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);

// Every word must appear somewhere; title matches rank first, then newer items.
function searchItems(items: Record<string, Item>, terms: string[], limit: number): Item[] {
  const scored: [Item, number][] = [];
  for (const item of Object.values(items)) {
    if (item.deletedAt) continue;
    const title = item.title.toLowerCase();
    const text = `${title} ${item.url} ${item.notes} ${item.description} ${item.file?.name ?? ''}`.toLowerCase();
    if (!terms.every((term) => text.includes(term))) continue;
    const score = (title.startsWith(terms[0]) ? 4 : 0) + (terms.every((term) => title.includes(term)) ? 2 : 0);
    scored.push([item, score]);
  }
  return scored
    .sort((a, b) => b[1] - a[1] || b[0].createdAt.localeCompare(a[0].createdAt))
    .slice(0, limit)
    .map(([item]) => item);
}

const FIELD_LABELS: Record<SearchHit['field'], string> = {
  title: 'Title',
  notes: 'Notes',
  page: 'Page',
  highlight: 'Highlight',
  session: 'Session notes',
};

// Server snippets mark matched words with \u0002 … \u0003.
function Snippet({ text }: { text: string }) {
  return text.split(/(\u0002[^\u0003]*\u0003)/).map((part, index) =>
    part.startsWith('\u0002') ? (
      <mark key={index} className="text-foreground">
        {part.slice(1, -1)}
      </mark>
    ) : (
      part
    )
  );
}

export function CommandPalette() {
  const open = useUi((state) => state.paletteOpen);
  const navigate = useNavigate();
  const { spaceId, folderId } = useParams();
  const items = useStore((state) => state.items);
  const folders = useStore((state) => state.folders);
  const spaces = useStore((state) => state.spaces);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // The dialog normally focuses its input, but not when reopened mid-way through closing.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const terms = useMemo(() => words(query), [query]);
  const here: Folder | null =
    folderId && folders[folderId] && folderStatus(folders, folderId) !== 'trashed' ? folders[folderId] : null;
  const hereName = here?.title ?? 'Inbox';
  const base = `/s/${spaceId}`;

  const paths = useMemo(
    () =>
      Object.values(folders)
        .filter((folder) => folderStatus(folders, folder.id) !== 'trashed')
        .map((folder) => ({
          folder,
          path: folderPath(folders, folder.id)
            .map((f) => f.title)
            .join(' / '),
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [folders]
  );

  const foundItems = useMemo(() => {
    if (terms.length) return searchItems(items, terms, 8);
    return Object.values(items)
      .filter((item) => !item.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5);
  }, [items, terms]);

  const foundFolders = terms.length
    ? paths.filter(({ path }) => terms.every((term) => path.toLowerCase().includes(term))).slice(0, 6)
    : [];

  // Full-text matches from the server (notes, saved pages, highlights, session notes), shortly after typing
  // stops. Results are kept with the query they answer, so a slow reply never shows under newer text.
  const [found, setFound] = useState<{ query: string; hits: SearchHit[] } | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (!open || !spaceId || q.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .get<{ hits: SearchHit[] }>(`/spaces/${spaceId}/search?q=${encodeURIComponent(q)}`)
        .then((result) => !cancelled && setFound({ query: q, hits: result.hits }))
        .catch(() => {});
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, spaceId]);
  const shownItemIds = new Set(foundItems.map((item) => item.id));
  const shownFolderIds = new Set(foundFolders.map(({ folder }) => folder.id));
  const textHits = (found && found.query === query.trim() ? found.hits : []).filter((hit) =>
    hit.type === 'item' ? items[hit.id] && !shownItemIds.has(hit.id) : folders[hit.id] && !shownFolderIds.has(hit.id)
  );

  const close = () => {
    openPalette(false);
    setQuery('');
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };

  const urls = query.trim() ? extractUrls(query) : null;
  const save: Action[] = query.trim()
    ? [
        {
          id: 'save',
          label: urls
            ? `Save ${urls.length === 1 ? 'link' : `${urls.length} links`} to ${hereName}`
            : `Save as a note in ${hereName}`,
          icon: urls ? <Link2 /> : <StickyNote />,
          run: () => void addFromText(query, here?.id ?? null),
        },
      ]
    : [];

  const newFolder = async (parentId: string | null) => {
    const folder = await createFolder({ parentId, title: 'Untitled folder' });
    if (folder) {
      focusFolderTitle(folder.id);
      navigate(`${base}/f/${folder.id}`);
    }
  };

  const actions: Action[] = [
    {
      id: 'upload',
      label: `Upload files to ${hereName}`,
      keywords: 'add attach file image',
      icon: <Paperclip />,
      run: () => pickFiles(here?.id ?? null),
    },
    {
      id: 'new-folder',
      label: 'New folder',
      keywords: 'create add',
      icon: <FolderPlus />,
      run: () => void newFolder(null),
    },
    ...(here
      ? [
          {
            id: 'new-subfolder',
            label: `New subfolder in ${here.title}`,
            keywords: 'create add',
            icon: <FolderPlus />,
            run: () => void newFolder(here.id),
          },
        ]
      : []),
    { id: 'inbox', label: 'Go to Inbox', icon: <Inbox />, run: () => navigate(base) },
    { id: 'archive', label: 'Go to Archive', icon: <Archive />, run: () => navigate(`${base}/archive`) },
    {
      id: 'trash',
      label: 'Go to Trash',
      keywords: 'deleted bin',
      icon: <Trash2 />,
      run: () => navigate(`${base}/trash`),
    },
    ...spaces
      .filter((space) => space.id !== spaceId)
      .map((space) => ({
        id: `space-${space.id}`,
        label: `Switch to ${space.name}`,
        keywords: 'space',
        icon: <Repeat />,
        run: () => navigate(`/s/${space.id}`),
      })),
    {
      id: 'import',
      label: 'Import bookmarks',
      keywords: 'pocket raindrop browser',
      icon: <Import />,
      run: () => openSettings('import'),
    },
    {
      id: 'settings',
      label: 'Settings',
      keywords: 'account password',
      icon: <Settings />,
      run: () => openSettings('account'),
    },
    { id: 'light', label: 'Light theme', keywords: 'appearance', icon: <Sun />, run: () => setTheme('light') },
    { id: 'dark', label: 'Dark theme', keywords: 'appearance', icon: <Moon />, run: () => setTheme('dark') },
    {
      id: 'system',
      label: 'System theme',
      keywords: 'appearance auto',
      icon: <Monitor />,
      run: () => setTheme('system'),
    },
  ];
  const foundActions = terms.length
    ? actions.filter((action) =>
        terms.every((term) => `${action.label} ${action.keywords ?? ''}`.toLowerCase().includes(term))
      )
    : actions.slice(0, 6);

  const folderLabel = (item: Item) =>
    item.folderId
      ? folderPath(folders, item.folderId)
          .map((f) => f.title)
          .join(' / ')
      : 'Inbox';

  const whenFolder = (folder: Folder) =>
    [folder.term, folder.sessionDate && formatSessionDate(folder.sessionDate)].filter(Boolean).join(' · ') ||
    folderLabel({ folderId: folder.parentId } as Item);
  const whereItem = (item: Item) => {
    const folder = item.folderId ? folders[item.folderId] : undefined;
    return [folderLabel(item), folder?.term].filter(Boolean).join(' · ');
  };

  const actionGroup = (heading: string, list: Action[]) =>
    list.length > 0 && (
      <CommandGroup heading={heading}>
        {list.map((action) => (
          <CommandItem key={action.id} value={action.id} onSelect={run(action.run)}>
            {action.icon}
            {action.label}
          </CommandItem>
        ))}
      </CommandGroup>
    );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && close()}
      title="Search Linkr"
      description="Find items and folders, or run an action"
      className="sm:max-w-xl"
    >
      {/* Results are ranked here, so cmdk's own filtering is off. */}
      <Command shouldFilter={false} loop>
        <CommandInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder="Search, paste a link, or type a note…"
        />
        <CommandList className="max-h-[min(420px,60svh)]">
          <CommandEmpty>Nothing found.</CommandEmpty>
          {/* A link goes first so Enter saves it. Typed words find things first; saving them as a note comes last. */}
          {urls && actionGroup('Save', save)}
          {foundItems.length > 0 && (
            <CommandGroup heading={terms.length ? 'Items' : 'Recent'}>
              {foundItems.map((item) => (
                <CommandItem key={item.id} value={`item-${item.id}`} onSelect={run(() => openItem(item))}>
                  <Favicon item={item} />
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                  <CommandShortcut className="max-w-40 truncate tracking-normal">
                    {terms.length ? folderLabel(item) : itemSubtitle(item)}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {textHits.length > 0 && (
            <CommandGroup heading="Found in notes and pages">
              {textHits.slice(0, 10).map((hit) => {
                const item = hit.type === 'item' ? items[hit.id] : undefined;
                const folder = hit.type === 'folder' ? folders[hit.id] : undefined;
                return (
                  <CommandItem
                    key={`${hit.type}-${hit.id}`}
                    value={`hit-${hit.type}-${hit.id}`}
                    onSelect={run(() => {
                      if (item) openItem(item);
                      else if (folder) {
                        if (hit.field === 'session') showSessionNotes(true);
                        navigate(`${base}/f/${folder.id}`);
                      }
                    })}
                    className="items-start"
                  >
                    {item ? <Favicon item={item} className="mt-0.5" /> : folder && <FolderGlyph folder={folder} />}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">
                        {item?.title ?? folder?.title}
                        {/* The same link or session can exist in several terms: say which this is. */}
                        <span className="text-muted-foreground">
                          {' '}
                          · {item ? whereItem(item) : folder && whenFolder(folder)}
                        </span>
                      </span>
                      <span className="text-muted-foreground line-clamp-2 text-xs">
                        <span className="font-medium">{FIELD_LABELS[hit.field]}: </span>
                        <Snippet text={hit.snippet} />
                      </span>
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
          {foundFolders.length > 0 && (
            <CommandGroup heading="Folders">
              {foundFolders.map(({ folder, path }) => (
                <CommandItem
                  key={folder.id}
                  value={`folder-${folder.id}`}
                  onSelect={run(() => navigate(`${base}/f/${folder.id}`))}
                >
                  <FolderGlyph folder={folder} />
                  <span className="truncate">{path}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {actionGroup('Actions', foundActions)}
          {!urls && actionGroup('Save', save)}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
