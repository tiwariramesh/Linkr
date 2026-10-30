import { Monitor, Moon, Puzzle, Sun, Upload } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { setTheme, useTheme, type Theme } from '@/lib/theme';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { loadSession, logout, openSpace, useStore } from '@/store/store';
import { closeSettings, useUi } from '@/store/ui';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-xl border p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}

// Runs a request and reports the outcome as a toast; returns whether it worked.
async function attempt(action: () => Promise<unknown>, success: string) {
  try {
    await action();
    toast.success(success);
    return true;
  } catch (error) {
    toast.error(error instanceof ApiError ? error.message : 'Something went wrong');
    return false;
  }
}

function AccountTab() {
  const user = useStore((state) => state.user);
  const [username, setUsername] = useState(user?.username ?? '');
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const [deletePassword, setDeletePassword] = useState('');

  const saveUsername = async (event: FormEvent) => {
    event.preventDefault();
    if (await attempt(() => api.patch('/me/username', { username: username.trim() }), 'Username updated'))
      await loadSession();
  };
  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await attempt(
      () => api.patch('/me/password', { currentPassword: passwords.current, newPassword: passwords.next }),
      'Password changed. Other devices have been signed out.'
    );
    if (ok) setPasswords({ current: '', next: '' });
  };
  const deleteAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (await attempt(() => api.delete('/me', { password: deletePassword }), 'Your account has been deleted')) {
      closeSettings();
      await logout();
    }
  };

  return (
    <div className="grid gap-4">
      <Section title="Username" description={`Signed in as ${user?.email}`}>
        <form onSubmit={saveUsername} className="flex gap-2">
          <Input value={username} onChange={(event) => setUsername(event.target.value)} aria-label="Username" />
          <Button type="submit" variant="outline" disabled={!username.trim() || username.trim() === user?.username}>
            Save
          </Button>
        </form>
      </Section>
      <Section title="Password" description="Changing it signs you out on your other devices.">
        <form onSubmit={savePassword} className="grid gap-2">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={passwords.current}
            onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
          />
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="New password (at least 8 characters)"
            value={passwords.next}
            onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
          />
          <Button
            type="submit"
            variant="outline"
            className="justify-self-start"
            disabled={!passwords.current || passwords.next.length < 8}
          >
            Change password
          </Button>
        </form>
      </Section>
      <Section
        title="Delete account"
        description="Deletes your account and every space only you belong to. This can’t be undone."
      >
        <form onSubmit={deleteAccount} className="flex gap-2">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
          />
          <Button type="submit" variant="destructive" disabled={!deletePassword}>
            Delete
          </Button>
        </form>
      </Section>
    </div>
  );
}

function ImportTab() {
  const spaceId = useStore((state) => state.spaceId);
  const spaceName = useStore((state) => state.spaces.find((space) => space.id === state.spaceId)?.name);
  const navigate = useNavigate();
  const [source, setSource] = useState<'browser' | 'raindrop' | 'pocket'>('browser');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !spaceId) return;
    setBusy(true);
    const form = new FormData();
    form.append('file', file);
    form.append('source', source);
    try {
      const result = await api.post<{ imported: number; folderId: string }>(
        `/spaces/${spaceId}/import/${source === 'pocket' ? 'pocket' : 'bookmarks'}`,
        form
      );
      await openSpace(spaceId, true);
      toast.success(`Imported ${result.imported} links`);
      closeSettings();
      navigate(`/s/${spaceId}/f/${result.folderId}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Section
        title="Import bookmarks"
        description={`Everything goes into a new folder in “${spaceName}”, keeping your folder structure and dates.`}
      >
        <div className="grid gap-1.5">
          <Label>From</Label>
          <Select value={source} onValueChange={(value) => setSource(value as typeof source)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="browser">Chrome, Edge, Firefox or Safari (.html)</SelectItem>
              <SelectItem value="raindrop">Raindrop.io (.html)</SelectItem>
              <SelectItem value="pocket">Pocket export (.zip)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="import-file">File</Label>
          <Input
            id="import-file"
            type="file"
            accept={source === 'pocket' ? '.zip' : '.html,.htm'}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="text-muted-foreground text-xs">
            In your browser, open the bookmark manager and choose <em>Export bookmarks</em>.
          </p>
        </div>
        <Button type="submit" className="justify-self-start" disabled={!file || busy}>
          <Upload /> {busy ? 'Importing…' : 'Import'}
        </Button>
      </Section>
    </form>
  );
}

type BrowserToken = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

// Browsers connected through the Linkr extension; each has its own token, which can be revoked here.
function BrowserTab() {
  const [tokens, setTokens] = useState<BrowserToken[] | null>(null);
  const load = useCallback(async () => {
    try {
      setTokens(await api.get<BrowserToken[]>('/extension/tokens'));
    } catch {
      setTokens([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const disconnect = async (token: BrowserToken) => {
    if (!confirm(`Disconnect ${token.name}? Its Linkr extension will stop saving until you connect it again.`)) return;
    if (await attempt(() => api.delete(`/extension/tokens/${token.id}`), `${token.name} disconnected`)) await load();
  };

  return (
    <div className="grid gap-4">
      <Section
        title="Linkr extension"
        description="Save the page you’re on, selected text and whole tab groups from Chrome or Edge, and open any session as a tab group."
      >
        <ol className="text-muted-foreground grid list-decimal gap-1 pl-5 text-sm">
          <li>Install the extension (see “Browser extension” in the README).</li>
          <li>Click its icon, enter this Linkr’s address and choose Connect.</li>
          <li>Approve on the Linkr page that opens.</li>
        </ol>
      </Section>
      <Section title="Connected browsers">
        {tokens === null ? null : tokens.length === 0 ? (
          <p className="text-muted-foreground text-sm">No browsers connected yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center gap-3 px-3 py-2">
                <Puzzle className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{token.name}</span>
                  <span className="text-muted-foreground text-xs">
                    Connected {timeAgo(token.createdAt)}
                    {token.lastUsedAt && ` · last used ${timeAgo(token.lastUsedAt)}`}
                  </span>
                </span>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void disconnect(token)}>
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function AppearanceTab() {
  const theme = useTheme((state) => state.theme);
  const options: [Theme, string, ReactNode][] = [
    ['light', 'Light', <Sun key="l" />],
    ['dark', 'Dark', <Moon key="d" />],
    ['system', 'Match system', <Monitor key="s" />],
  ];
  return (
    <Section title="Theme">
      <div className="grid grid-cols-3 gap-2">
        {options.map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            className={cn(
              'hover:bg-muted flex flex-col items-center gap-2 rounded-lg border p-3 text-sm [&_svg]:size-5',
              theme === value && 'ring-primary ring-2'
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>
    </Section>
  );
}

function AboutTab() {
  const info = useStore((state) => state.appInfo);
  return (
    <div className="grid gap-4">
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <img src="/logo.svg" alt="" className="size-12" />
        <p className="text-lg font-semibold">Linkr</p>
        <p className="text-muted-foreground text-sm">Version {info?.version ?? '–'}</p>
        {info?.updateAvailable && <p className="text-sm text-amber-600">Version {info.latestVersion} is available.</p>}
      </div>
      <Section title="Open source">
        <p className="text-muted-foreground text-sm">
          Linkr is free software under the MIT licence.{' '}
          <a
            className="text-foreground underline"
            href="https://github.com/tiwariramesh/Linkr"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source code and releases
          </a>
          . It began as a fork of{' '}
          <a
            className="text-foreground underline"
            href="https://github.com/denho/faved"
            target="_blank"
            rel="noopener noreferrer"
          >
            Faved
          </a>{' '}
          by Denis Dvali.
        </p>
      </Section>
    </div>
  );
}

export function SettingsDialog() {
  const open = useUi((state) => state.settingsOpen);
  const tab = useUi((state) => state.settingsTab);
  return (
    <Dialog open={open} onOpenChange={(value) => !value && closeSettings()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="sr-only">
            Account, import, browser extension, appearance and version information.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(value) => useUi.setState({ settingsTab: value as typeof tab })}>
          <TabsList className="w-full">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="browser">Browser</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>
          <TabsContent value="account" className="mt-4">
            <AccountTab />
          </TabsContent>
          <TabsContent value="import" className="mt-4">
            <ImportTab />
          </TabsContent>
          <TabsContent value="browser" className="mt-4">
            <BrowserTab />
          </TabsContent>
          <TabsContent value="appearance" className="mt-4">
            <AppearanceTab />
          </TabsContent>
          <TabsContent value="about" className="mt-4">
            <AboutTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
