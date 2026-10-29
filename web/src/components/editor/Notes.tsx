import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { api } from '@/lib/api';
import type { Folder, Item } from '@/lib/types';
import { updateFolder, updateItem, useCanEdit } from '@/store/store';

// A folder's session notes: the plan, talking points, what happened.
export function SessionNotes({ folder }: { folder: Folder }) {
  const canEdit = useCanEdit();
  return (
    <BlockEditor
      key={folder.id}
      body={folder.body}
      fallbackText={folder.notes}
      placeholder="Session notes: the plan, talking points, what happened…"
      folderId={folder.id}
      editable={canEdit}
      onSave={({ body, text }) => void updateFolder(folder.id, { body, notes: text })}
      className="h-full"
    />
  );
}

// An item's notes. For a note item this is the note itself (its title is edited separately).
export function ItemNotes({ item, className = 'h-full' }: { item: Item; className?: string }) {
  const canEdit = useCanEdit();
  return (
    <BlockEditor
      key={item.id}
      body={item.body}
      fallbackText={item.notes}
      placeholder={item.kind === 'note' ? 'Start writing…' : 'Why it matters, what to point out, questions to ask…'}
      folderId={item.folderId}
      editable={canEdit}
      onSave={({ body, text }) => void updateItem(item.id, { body, notes: text })}
      className={className}
    />
  );
}

type Draft = { body: string | null; notes: string };

// Your private draft for a folder: thoughts before they're ready for the shared session notes. Nobody
// else in the space can see it, viewers included; it follows you across your own devices.
export function DraftNotes({ folder }: { folder: Folder }) {
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .get<Draft | null>(`/folders/${folder.id}/draft`)
        .then((found) => !cancelled && setDraft(found ?? { body: null, notes: '' }))
        .catch(() => {});
    void load();
    // Saved on another of your devices.
    const onDraft = (event: Event) => {
      if ((event as CustomEvent<string>).detail === folder.id) void load();
    };
    window.addEventListener('linkr:draft', onDraft);
    return () => {
      cancelled = true;
      window.removeEventListener('linkr:draft', onDraft);
    };
  }, [folder.id]);

  if (!draft) return <p className="text-muted-foreground p-4 text-sm">Loading your draft…</p>;
  return (
    <div className="flex h-full flex-col">
      <p className="text-muted-foreground flex items-center gap-1.5 px-4 pt-3 text-xs">
        <Lock className="size-3.5" /> Only you can see this draft
      </p>
      <BlockEditor
        key={folder.id}
        body={draft.body}
        fallbackText={draft.notes}
        placeholder="A private draft: ideas before they’re ready to share…"
        // Uploads would become folder items everyone can see, so drafts take text only.
        folderId={undefined}
        onSave={({ body, text }) =>
          void api
            .put(`/folders/${folder.id}/draft`, { body, notes: text })
            .catch(() => toast.error('Couldn’t save your draft'))
        }
        className="min-h-0 flex-1"
      />
    </div>
  );
}
