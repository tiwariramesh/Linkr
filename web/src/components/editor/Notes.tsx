import { RichEditor } from '@/components/editor/RichEditor';
import type { Folder, Item } from '@/lib/types';
import { updateFolder, updateItem } from '@/store/store';

const firstLine = (text: string) => text.trim().split('\n')[0].slice(0, 120);

// A folder's session notes: the plan, talking points, what happened.
export function SessionNotes({ folder }: { folder: Folder }) {
  return (
    <RichEditor
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

// An item's own notes. For a note item this is the note itself, and its title follows the first line
// until the title is changed by hand.
export function ItemNotes({ item }: { item: Item }) {
  const isNote = item.kind === 'note';
  return (
    <RichEditor
      key={item.id}
      body={item.body}
      fallbackText={item.notes}
      placeholder={isNote ? 'Write your note…' : 'Why it matters, what to point out, questions to ask…'}
      folderId={item.folderId}
      onSave={({ body, text }) => {
        const autoTitle = isNote && (item.title === firstLine(item.notes) || item.title === 'Untitled note');
        void updateItem(item.id, {
          body,
          notes: text,
          ...(autoTitle ? { title: firstLine(text) || 'Untitled note' } : {}),
        });
      }}
      className="h-full"
    />
  );
}
