import { Download, ExternalLink, PanelsLeftRight, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatBytes, timeAgo } from '@/lib/format';
import { fileUrl, KIND_ICON, openItem } from '@/lib/items';
import { folderPath, folderStatus } from '@/lib/tree';
import type { Item } from '@/lib/types';
import { createTag, updateItem, useStore } from '@/store/store';
import { editItem, useUi } from '@/store/ui';

function TagPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const tags = useStore((state) => state.tags);
  const [text, setText] = useState('');
  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase().replace(/^#/, '');
    return Object.values(tags)
      .filter((tag) => !value.includes(tag.id) && (!q || tag.title.toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 6);
  }, [tags, text, value]);

  const add = async (title: string) => {
    const clean = title.trim().replace(/^#/, '');
    if (!clean) return;
    const tag = await createTag(clean);
    if (tag && !value.includes(tag.id)) onChange([...value, tag.id]);
    setText('');
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) =>
          tags[id] ? (
            <span key={id} className="bg-muted flex items-center gap-1 rounded-md py-0.5 pr-1 pl-2 text-xs font-medium">
              #{tags[id].title}
              <button
                type="button"
                aria-label={`Remove ${tags[id].title}`}
                onClick={() => onChange(value.filter((t) => t !== id))}
                className="hover:bg-background rounded p-0.5"
              >
                <X className="size-3" />
              </button>
            </span>
          ) : null
        )}
      </div>
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            void add(text);
          }
        }}
        placeholder="Add a tag and press Enter"
        aria-label="Add tag"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => onChange([...value, tag.id])}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md border px-2 py-0.5 text-xs"
            >
              #{tag.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({ item }: { item: Item }) {
  const file = item.file!;
  const Icon = KIND_ICON[item.kind];
  return (
    <div className="bg-muted/50 flex items-center gap-3 rounded-lg border p-3">
      <Icon className="text-muted-foreground size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-muted-foreground text-xs">{formatBytes(file.size)}</p>
      </div>
      {file.id && (
        <>
          <Button type="button" variant="outline" size="icon" asChild>
            <a href={fileUrl(file)} target="_blank" rel="noopener" aria-label="Open file">
              <ExternalLink />
            </a>
          </Button>
          <Button type="button" variant="outline" size="icon" asChild>
            <a href={fileUrl(file, true)} download={file.name} aria-label="Download file">
              <Download />
            </a>
          </Button>
        </>
      )}
    </div>
  );
}

function ItemForm({ item }: { item: Item }) {
  const folders = useStore((state) => state.folders);
  const folderOptions = useMemo(
    () =>
      Object.values(folders)
        .filter((folder) => folderStatus(folders, folder.id) === 'active')
        .map((folder) => ({
          id: folder.id,
          label: folderPath(folders, folder.id)
            .map((f) => f.title)
            .join(' / '),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [folders]
  );
  const [draft, setDraft] = useState({
    title: item.title,
    url: item.url,
    description: item.description,
    notes: item.notes,
    folderId: item.folderId ?? '',
    tagIds: item.tagIds,
  });
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const patch: Parameters<typeof updateItem>[1] = {};
    if (draft.title.trim() && draft.title.trim() !== item.title) patch.title = draft.title.trim();
    if (draft.url.trim() !== item.url) patch.url = draft.url.trim();
    if (draft.description !== item.description) patch.description = draft.description;
    if (draft.notes !== item.notes) patch.notes = draft.notes;
    if ((draft.folderId || null) !== item.folderId) patch.folderId = draft.folderId || null;
    if (draft.tagIds.join() !== item.tagIds.join()) patch.tagIds = draft.tagIds;
    if (Object.keys(patch).length) void updateItem(item.id, patch);
    editItem(null);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="item-title">Title</Label>
        <Input id="item-title" value={draft.title} onChange={(event) => set({ title: event.target.value })} />
      </div>
      {item.file && <FileRow item={item} />}
      {item.kind !== 'note' && !item.file && (
        <div className="grid gap-1.5">
          <Label htmlFor="item-url">Link</Label>
          <div className="flex gap-2">
            <Input id="item-url" value={draft.url} onChange={(event) => set({ url: event.target.value })} />
            <Button type="button" variant="outline" size="icon" asChild>
              <a href={item.url} target="_blank" rel="noopener noreferrer" aria-label="Open link">
                <ExternalLink />
              </a>
            </Button>
          </div>
        </div>
      )}
      {item.kind !== 'note' && !item.file && (
        <div className="grid gap-1.5">
          <Label htmlFor="item-description">Description</Label>
          <Textarea
            id="item-description"
            rows={2}
            value={draft.description}
            onChange={(event) => set({ description: event.target.value })}
          />
        </div>
      )}
      {item.body ? (
        <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span className="text-muted-foreground">
            {item.kind === 'note' ? 'This note' : 'The notes'} are written in the notes editor.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              editItem(null);
              openItem(item);
            }}
          >
            <PanelsLeftRight /> Open
          </Button>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="item-notes">{item.kind === 'note' ? 'Note' : 'Your notes'}</Label>
          <Textarea
            id="item-notes"
            rows={item.kind === 'note' ? 8 : 4}
            value={draft.notes}
            onChange={(event) => set({ notes: event.target.value })}
            placeholder={item.kind === 'note' ? '' : 'Why it matters, what to point out, questions to ask…'}
          />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>Folder</Label>
          <Select
            value={draft.folderId || 'inbox'}
            onValueChange={(value) => set({ folderId: value === 'inbox' ? '' : value })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inbox">Inbox</SelectItem>
              {folderOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Tags</Label>
          <TagPicker value={draft.tagIds} onChange={(tagIds) => set({ tagIds })} />
        </div>
      </div>
      <DialogFooter className="items-center sm:justify-between">
        <span className="text-muted-foreground text-xs">Saved {timeAgo(item.createdAt)}</span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => editItem(null)}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </DialogFooter>
    </form>
  );
}

export function ItemDialog() {
  const id = useUi((state) => state.editingItemId);
  const item = useStore((state) => (id ? state.items[id] : undefined));
  // Close if the item disappears (deleted on another device).
  useEffect(() => {
    if (id && !item) editItem(null);
  }, [id, item]);

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && editItem(null)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item?.kind === 'note' ? 'Edit note' : item?.file ? 'Edit file' : 'Edit link'}</DialogTitle>
          <DialogDescription className="sr-only">Change the title, notes, folder and tags.</DialogDescription>
        </DialogHeader>
        {item && <ItemForm key={item.id} item={item} />}
      </DialogContent>
    </Dialog>
  );
}
