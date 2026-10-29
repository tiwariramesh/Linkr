import { Repeat } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { childFolders, folderPath, folderStatus, isInside } from '@/lib/tree';
import type { Folder } from '@/lib/types';
import { runAgain, useStore } from '@/store/store';
import { askRunAgain, useUi } from '@/store/ui';

const TOP_LEVEL = 'top';

function RunAgainForm({ folder }: { folder: Folder }) {
  const navigate = useNavigate();
  const folders = useStore((state) => state.folders);
  const [title, setTitle] = useState(folder.title);
  const [sessionDate, setSessionDate] = useState('');
  const [term, setTerm] = useState('');
  const [parent, setParent] = useState(folder.parentId ?? TOP_LEVEL);
  const [subfolders, setSubfolders] = useState(true);
  const [notes, setNotes] = useState(true);
  const [highlights, setHighlights] = useState(true);
  const [busy, setBusy] = useState(false);
  const hasSubfolders = childFolders(folders, folder.id).length > 0;

  // Terms already used in this space, to pick from.
  const terms = useMemo(
    () => [...new Set(Object.values(folders).flatMap((f) => (f.term ? [f.term] : [])))].sort(),
    [folders]
  );
  // Anywhere active, except inside the folder being copied.
  const places = useMemo(
    () =>
      Object.values(folders)
        .filter((f) => folderStatus(folders, f.id) === 'active' && !isInside(folders, f.id, folder.id))
        .map((f) => ({
          id: f.id,
          label: folderPath(folders, f.id)
            .map((p) => p.title)
            .join(' / '),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [folders, folder.id]
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const copy = await runAgain(folder.id, {
      title: title.trim(),
      sessionDate: sessionDate || null,
      term: term.trim() || null,
      parentId: parent === TOP_LEVEL ? null : parent,
      subfolders,
      notes,
      highlights,
    });
    setBusy(false);
    if (!copy) return;
    askRunAgain(null);
    toast.success(`“${copy.title}” is ready`, { description: 'A copy of the session, linked to the original.' });
    navigate(`/s/${copy.spaceId}/f/${copy.id}`);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="run-title">Name</Label>
        <Input id="run-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="run-date">Date</Label>
          <Input
            id="run-date"
            type="date"
            value={sessionDate}
            onChange={(event) => setSessionDate(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="run-term">Term, cohort or series</Label>
          <Input
            id="run-term"
            list="run-terms"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={folder.term ? `e.g. after ${folder.term}` : 'e.g. Term 2 2026'}
          />
          <datalist id="run-terms">
            {terms.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label>Put it in</Label>
        <Select value={parent} onValueChange={setParent}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TOP_LEVEL}>Top level</SelectItem>
            {places.map((place) => (
              <SelectItem key={place.id} value={place.id}>
                {place.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">Links, files and notes-as-items always come along. Also copy:</p>
        {hasSubfolders && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={subfolders} onCheckedChange={(value) => setSubfolders(value === true)} />
            Subfolders and everything in them
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={notes} onCheckedChange={(value) => setNotes(value === true)} />
          Session notes and notes on items
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={highlights} onCheckedChange={(value) => setHighlights(value === true)} />
          Highlights and their comments
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => askRunAgain(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !title.trim()}>
          <Repeat /> {busy ? 'Copying…' : 'Make a copy'}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Copies a session (with its links, files and notes) for a new date or term.
export function RunAgainDialog() {
  const id = useUi((state) => state.runAgainFolderId);
  const folder = useStore((state) => (id ? state.folders[id] : undefined));
  return (
    <Dialog open={!!folder} onOpenChange={(open) => !open && askRunAgain(null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Run “{folder?.title}” again</DialogTitle>
          <DialogDescription>
            Make a fresh copy for a new date or term. The original stays as it was, and each one links to the other.
          </DialogDescription>
        </DialogHeader>
        {folder && <RunAgainForm key={folder.id} folder={folder} />}
      </DialogContent>
    </Dialog>
  );
}
