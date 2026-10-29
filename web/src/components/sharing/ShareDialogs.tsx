import { Copy, ExternalLink, Globe, Send } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { shareFolder, useStore } from '@/store/store';
import { sendItem } from '@/store/social';
import { askSendItem, askShareFolder, useUi } from '@/store/ui';

export const publicUrl = (token: string) => `${window.location.origin}/p/${token}`;

// A read-only page for a folder that anyone with the link can open, e.g. students after a session.
export function ShareFolderDialog() {
  const id = useUi((state) => state.shareFolderId);
  const folder = useStore((state) => (id ? state.folders[id] : undefined));
  const [busy, setBusy] = useState(false);
  const run = async (options: { enabled: boolean; notes?: boolean }) => {
    if (!folder) return;
    setBusy(true);
    await shareFolder(folder.id, options);
    setBusy(false);
  };
  const url = folder?.shareToken ? publicUrl(folder.shareToken) : null;

  return (
    <Dialog open={!!folder} onOpenChange={(open) => !open && askShareFolder(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share “{folder?.title}” with a link</DialogTitle>
          <DialogDescription>
            A read-only page anyone with the link can open, without an account. It shows this folder’s links, files and
            notes; your notes about links stay private.
          </DialogDescription>
        </DialogHeader>
        {folder && (
          <div className="grid gap-4">
            <label className="flex items-center gap-3 rounded-lg border p-3">
              <Globe className="text-muted-foreground size-5 shrink-0" />
              <span className="flex-1 text-sm">
                <span className="block font-medium">Public link</span>
                <span className="text-muted-foreground text-xs">
                  {url ? 'On: anyone with the link can view' : 'Off'}
                </span>
              </span>
              <Checkbox
                checked={!!url}
                disabled={busy}
                onCheckedChange={(value) => void run({ enabled: value === true })}
                aria-label="Public link"
              />
            </label>
            {url && (
              <>
                <div className="flex gap-2">
                  <Input readOnly value={url} onFocus={(event) => event.currentTarget.select()} aria-label="Link" />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copy link"
                    onClick={() => {
                      void navigator.clipboard.writeText(url);
                      toast.success('Link copied');
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button variant="outline" size="icon" asChild>
                    <a href={url} target="_blank" rel="noopener" aria-label="Open the page">
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={folder.shareNotes}
                    disabled={busy}
                    onCheckedChange={(value) => void run({ enabled: true, notes: value === true })}
                  />
                  Include the session notes
                </label>
                <p className="text-muted-foreground text-xs">
                  Turning the link off stops it working; turning it on again makes a new one.
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Sends a link or note to another account; they choose whether to save it.
export function SendItemDialog() {
  const id = useUi((state) => state.sendItemId);
  const item = useStore((state) => (id ? state.items[id] : undefined));
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    setBusy(true);
    const ok = await sendItem(item.id, to.trim(), message.trim());
    setBusy(false);
    if (ok) {
      setTo('');
      setMessage('');
      askSendItem(null);
    }
  };
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && askSendItem(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send “{item?.title}”</DialogTitle>
          <DialogDescription>They’ll get a notification and can save it to their Inbox.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="send-to">To</Label>
            <Input
              id="send-to"
              autoFocus
              autoComplete="off"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="Their Linkr username or email"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="send-message">Message (optional)</Label>
            <Textarea
              id="send-message"
              rows={2}
              value={message}
              maxLength={1000}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="e.g. For Friday's session"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !to.trim()}>
              <Send /> Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
