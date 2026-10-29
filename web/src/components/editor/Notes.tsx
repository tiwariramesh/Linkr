import { BlockEditor } from '@/components/editor/BlockEditor';
import type { Folder, Item } from '@/lib/types';
import { updateFolder, updateItem } from '@/store/store';

// A folder's session notes: the plan, talking points, what happened.
export function SessionNotes({ folder }: { folder: Folder }) {
  return (
    <BlockEditor
      key={folder.id}
      body={folder.body}
      fallbackText={folder.notes}
      placeholder="Session notes: the plan, talking points, what happened…"
      folderId={folder.id}
      onSave={({ body, text }) => void updateFolder(folder.id, { body, notes: text })}
      className="h-full"
    />
  );
}

// An item's notes. For a note item this is the note itself (its title is edited separately).
export function ItemNotes({ item, className = 'h-full' }: { item: Item; className?: string }) {
  return (
    <BlockEditor
      key={item.id}
      body={item.body}
      fallbackText={item.notes}
      placeholder={item.kind === 'note' ? 'Start writing…' : 'Why it matters, what to point out, questions to ask…'}
      folderId={item.folderId}
      onSave={({ body, text }) => void updateItem(item.id, { body, notes: text })}
      className={className}
    />
  );
}
