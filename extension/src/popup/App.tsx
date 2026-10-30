import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  FolderInput,
  FolderOpen,
  Layers,
  LogOut,
  Loader2,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  getConnection,
  getTarget,
  groupFolder,
  isSavable,
  itemUrl,
  linkGroup,
  linkr,
  LinkrError,
  linkrColor,
  normalizeServer,
  originPattern,
  resolveTarget,
  setConnection,
  setTarget,
  targetName,
  targetUrl,
  today,
  formatDate,
  type Connection,
  type LinkrState,
  type SavedHit,
  type Target,
} from '../lib/linkr.ts';
import { FolderPicker } from './FolderPicker.tsx';

const message = (error: unknown) => (error instanceof LinkrError ? error.message : 'Something went wrong');
const send = <T,>(msg: object) => chrome.runtime.sendMessage(msg) as Promise<T>;
const open = (url: string) => {
  void chrome.tabs.create({ url });
  window.close();
};

function Header({ conn, onDisconnect }: { conn: Connection | null; onDisconnect?: () => void }) {
  return (
    <header className="flex items-center gap-2 border-b px-3 py-2.5">
      <img src="icons/icon-32.png" alt="" className="size-5" />
      <span className="font-semibold tracking-tight">Linkr</span>
      {conn && (
        <>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1 truncate text-xs"
            onClick={() => open(conn.server)}
            title={`Open ${conn.server}`}
          >
            {conn.username} · {new URL(conn.server).host} <ArrowUpRight className="size-3" />
          </button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Disconnect this browser"
            title="Disconnect"
            onClick={onDisconnect}
          >
            <LogOut />
          </Button>
        </>
      )}
    </header>
  );
}

function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-1 px-2 pt-2">
      <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
        <ChevronLeft />
      </Button>
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

// ---- Connecting ----

function ConnectView({ onConnected }: { onConnected: () => void }) {
  const [address, setAddress] = useState('');
  const [usingCode, setUsingCode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void chrome.storage.local.get('lastServer').then(({ lastServer }) => setAddress((lastServer as string) ?? ''));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const server = normalizeServer(address);
    if (!server) return setError('Enter your Linkr’s address, like linkr.example.com');
    // Asked here, while the click still counts as the user's: Chrome only grants it then.
    const granted = await chrome.permissions.request({ origins: [originPattern(server)] });
    if (!granted) return setError('The extension needs access to your Linkr to save to it.');
    await chrome.storage.local.set({ lastServer: server });
    setBusy(true);
    if (usingCode) {
      const result = await send<{ ok: boolean; message?: string }>({ type: 'connect-code', server, token: code });
      setBusy(false);
      if (!result?.ok) return setError(result?.message ?? 'That code didn’t work');
      onConnected();
    } else {
      await send({ type: 'connect', server });
      window.close();
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 p-4">
      <div className="grid gap-1">
        <h1 className="text-base font-semibold">Connect to your Linkr</h1>
        <p className="text-muted-foreground text-sm">
          Save pages, notes and tab groups to your spaces, and open any session as a tab group.
        </p>
      </div>
      <Field label="Your Linkr’s address">
        <Input
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="linkr.example.com"
          autoFocus
          spellCheck={false}
        />
      </Field>
      {usingCode && (
        <Field label="Connection code">
          <Textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="lk_…"
            className="min-h-14 font-mono text-xs"
            spellCheck={false}
          />
        </Field>
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" size="lg" disabled={busy || !address.trim() || (usingCode && !code.trim())}>
        {busy && <Loader2 className="animate-spin" />} Connect
      </Button>
      <p className="text-muted-foreground text-xs">
        {usingCode ? (
          <>A Linkr tab opens to approve this browser. </>
        ) : (
          <>You’ll approve this browser on a Linkr page that opens. </>
        )}
        <button type="button" className="text-foreground underline" onClick={() => setUsingCode(!usingCode)}>
          {usingCode ? 'Connect on the Linkr page instead' : 'Paste a connection code instead'}
        </button>
      </p>
    </form>
  );
}

// ---- Saving the current tab ----

function TargetButton({ state, target, onClick }: { state: LinkrState; target: Target; onClick: () => void }) {
  const folder = target.folderId ? state.folders.find((f) => f.id === target.folderId) : null;
  const space = state.spaces.find((s) => s.id === target.spaceId);
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-background hover:bg-accent flex h-9 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-sm shadow-xs transition-colors"
    >
      <span className="w-4 text-center">
        {folder?.icon ?? <FolderInput className="text-muted-foreground size-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{targetName(state, target)}</span>
      {folder && space && state.spaces.length > 1 && (
        <span className="text-muted-foreground max-w-28 truncate text-xs">{space.name}</span>
      )}
      <ChevronDown className="text-muted-foreground size-4 shrink-0" />
    </button>
  );
}

type Done = { label: string; href: string };

export function App() {
  const [conn, setConn] = useState<Connection | null | undefined>(undefined);
  const [state, setState] = useState<LinkrState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [view, setView] = useState<'main' | 'pick' | 'tabs' | 'tabs-pick' | 'open'>('main');
  const [target, setTargetState] = useState<Target | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<SavedHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);

  // Load the connection, the folders and the tab the popup was opened on.
  useEffect(() => {
    void (async () => {
      const connection = await getConnection();
      setConn(connection);
      // ?tab=<id> opens the popup for a given tab (used by tests); normally it's the active tab.
      const tabParam = Number(new URLSearchParams(location.search).get('tab'));
      const current = tabParam
        ? await chrome.tabs.get(tabParam)
        : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      setTab(current ?? null);
      setTitle(current?.title ?? '');
      if (!connection) return;
      try {
        const loaded = await linkr.state();
        setState(loaded);
        setTargetState(resolveTarget(loaded, await getTarget()));
        if (isSavable(current?.url)) setSaved((await linkr.lookup(current.url)).saved);
      } catch (failure) {
        if (failure instanceof LinkrError && failure.status === 401) setConn(null);
        else setLoadError(message(failure));
      }
      // Selected text on the page becomes the start of the note.
      if (current?.id && isSavable(current.url)) {
        try {
          const [result] = await chrome.scripting.executeScript({
            target: { tabId: current.id },
            func: () => getSelection()?.toString() ?? '',
          });
          const selection = String(result?.result ?? '').trim();
          if (selection) setNote(`“${selection.slice(0, 5000)}”`);
        } catch {
          // pages the extension may not read (the Web Store, PDFs): no selection, that's fine
        }
      }
    })();
  }, []);

  const pick = (next: Target) => {
    setTargetState(next);
    void setTarget(next).then(() => send({ type: 'target-changed' }));
    setView('main');
  };

  const disconnect = async () => {
    await setConnection(null);
    await send({ type: 'target-changed' });
    setConn(null);
    setState(null);
  };

  const save = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!conn || !target || !tab) return;
    setBusy(true);
    setError('');
    try {
      const item = isSavable(tab.url)
        ? await linkr.saveLink(target, tab.url, title, note)
        : await linkr.saveNote(target, note);
      setDone({ label: targetName(state!, target), href: itemUrl(conn, target.spaceId, item.id) });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  };

  if (conn === undefined) return <div className="h-40" />;
  if (!conn)
    return (
      <>
        <Header conn={null} />
        <ConnectView onConnected={() => location.reload()} />
      </>
    );

  if (loadError)
    return (
      <>
        <Header conn={conn} onDisconnect={disconnect} />
        <div className="grid gap-3 p-4">
          <p className="text-sm">{loadError}</p>
          <Button variant="outline" onClick={() => location.reload()}>
            Try again
          </Button>
        </div>
      </>
    );
  if (!state || !target)
    return (
      <>
        <Header conn={conn} />
        <div className="text-muted-foreground flex h-40 items-center justify-center">
          <Loader2 className="animate-spin" />
        </div>
      </>
    );

  if (view === 'pick')
    return <FolderPicker state={state} mode="save" title="Save to" onPick={pick} onBack={() => setView('main')} />;
  if (view === 'open')
    return (
      <FolderPicker
        state={state}
        mode="open"
        title="Open a session as a tab group"
        onBack={() => setView('main')}
        onPick={async (picked) => {
          const result = await send<{ ok: boolean; message?: string }>({
            type: 'open-group',
            folderId: picked.folderId,
          });
          if (result?.ok) window.close();
          else {
            setView('main');
            setError(result?.message ?? 'Couldn’t open it');
          }
        }}
      />
    );
  if (view === 'tabs' || view === 'tabs-pick')
    return (
      <TabsView
        conn={conn}
        state={state}
        tab={tab}
        initialParent={target}
        picking={view === 'tabs-pick'}
        setPicking={(on) => setView(on ? 'tabs-pick' : 'tabs')}
        onBack={() => setView('main')}
      />
    );

  if (done)
    return (
      <>
        <Header conn={conn} onDisconnect={disconnect} />
        <div className="grid gap-4 p-4" role="status">
          <p className="flex items-center gap-2 font-medium">
            <span className="flex size-6 items-center justify-center rounded-full bg-green-600 text-white">
              <Check className="size-4" />
            </span>
            Saved to {done.label}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => open(done.href)}>
              <ExternalLink /> Open in Linkr
            </Button>
            <Button className="flex-1" onClick={() => window.close()}>
              Done
            </Button>
          </div>
        </div>
      </>
    );

  const savable = isSavable(tab?.url);
  return (
    <>
      <Header conn={conn} onDisconnect={disconnect} />
      <form onSubmit={save} className="grid gap-3 p-3">
        <div className="bg-card grid gap-1 rounded-xl border p-2.5 shadow-xs">
          <div className="flex items-center gap-2">
            {tab?.favIconUrl ? (
              <img src={tab.favIconUrl} alt="" className="size-4 shrink-0 rounded-sm" />
            ) : (
              <span className="bg-muted size-4 shrink-0 rounded-sm" />
            )}
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Title"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
              disabled={!savable}
            />
          </div>
          <span className="text-muted-foreground truncate pl-6 text-xs">
            {savable ? new URL(tab!.url!).host : 'This page can’t be saved as a link. Save a note instead.'}
          </span>
          {saved.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 pl-6">
              <span className="text-muted-foreground text-xs">Already in</span>
              {saved.slice(0, 3).map((hit) => (
                <button
                  key={hit.itemId}
                  type="button"
                  onClick={() => open(itemUrl(conn, hit.spaceId, hit.itemId))}
                  className="bg-brand-50 text-brand-800 hover:bg-brand-100 dark:bg-brand-950 dark:text-brand-200 rounded px-1.5 text-xs font-medium"
                >
                  {targetName(state, { spaceId: hit.spaceId, folderId: hit.folderId })}
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="Save to">
          <TargetButton state={state} target={target} onClick={() => setView('pick')} />
        </Field>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={savable ? 'Add a note (optional)' : 'Write a note'}
          className="max-h-32 min-h-16 text-sm"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void save();
          }}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" size="lg" disabled={busy || (!savable && !note.trim())} autoFocus>
          {busy && <Loader2 className="animate-spin" />}
          {savable ? 'Save page' : 'Save note'}
        </Button>
      </form>

      <div className="grid gap-0.5 border-t p-1.5">
        <Button variant="ghost" className="justify-start" onClick={() => setView('tabs')}>
          <Layers /> Save tabs as a session…
        </Button>
        <Button variant="ghost" className="justify-start" onClick={() => setView('open')}>
          <FolderOpen /> Open a session as a tab group…
        </Button>
        <Button variant="ghost" className="justify-start" onClick={() => open(targetUrl(conn, target))}>
          <ArrowUpRight /> Open {targetName(state, target)} in Linkr
        </Button>
      </div>
    </>
  );
}

// ---- Tab group / window -> a session folder ----

function TabsView({
  conn,
  state,
  tab,
  initialParent,
  picking,
  setPicking,
  onBack,
}: {
  conn: Connection;
  state: LinkrState;
  tab: chrome.tabs.Tab | null;
  initialParent: Target;
  picking: boolean;
  setPicking: (on: boolean) => void;
  onBack: () => void;
}) {
  const [tabs, setTabs] = useState<{ group: chrome.tabs.Tab[]; window: chrome.tabs.Tab[] } | null>(null);
  const [group, setGroup] = useState<chrome.tabGroups.TabGroup | null>(null);
  const [linkedFolder, setLinkedFolder] = useState<string | null>(null);
  const [scope, setScope] = useState<'group' | 'window'>('window');
  const [name, setName] = useState('');
  // A new session goes beside the session you last saved to (in its course folder), or into the folder.
  const [parent, setParent] = useState<Target>(() => {
    const folder = state.folders.find((f) => f.id === initialParent.folderId);
    return folder?.sessionDate ? { spaceId: folder.spaceId, folderId: folder.parentId } : initialParent;
  });
  const [dated, setDated] = useState(true);
  const [closeAfter, setCloseAfter] = useState(false);
  const [asNew, setAsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    void (async () => {
      if (!tab?.windowId) return;
      const all = (await chrome.tabs.query({ windowId: tab.windowId })).filter((t) => isSavable(t.url));
      const groupId = tab.groupId ?? -1;
      const inGroup = groupId >= 0 ? all.filter((t) => t.groupId === groupId) : [];
      if (groupId >= 0) {
        const info = await chrome.tabGroups.get(groupId);
        setGroup(info);
        setScope('group');
        setName(info.title || `Session ${today()}`);
        const folderId = await groupFolder(groupId);
        if (folderId && state.folders.some((f) => f.id === folderId)) setLinkedFolder(folderId);
      } else {
        setName(`Session ${today()}`);
      }
      setTabs({ group: inGroup, window: all });
    })();
  }, [tab, state]);

  if (picking)
    return (
      <FolderPicker
        state={state}
        mode="parent"
        title="Put the session in"
        onBack={() => setPicking(false)}
        onPick={(picked) => {
          setParent(picked);
          setPicking(false);
        }}
      />
    );

  if (!tabs) return <SubHeader title="Save tabs as a session" onBack={onBack} />;
  const chosen = scope === 'group' ? tabs.group : tabs.window;
  const linked = linkedFolder && scope === 'group' && !asNew ? state.folders.find((f) => f.id === linkedFolder) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const list = chosen.map((t) => ({ url: t.url!, title: t.title ?? '' }));
      let result: { folderId: string | null; saved: number };
      if (linked) {
        // Only what's new since the group was opened or last saved.
        const existing = new Set((await linkr.folderTabs(linked.id)).tabs.map((t) => t.url));
        const fresh = list.filter((t) => !existing.has(t.url));
        result = fresh.length
          ? await linkr.saveTabs({ spaceId: linked.spaceId, folderId: linked.id, tabs: fresh })
          : { folderId: linked.id, saved: 0 };
      } else {
        result = await linkr.saveTabs({
          spaceId: parent.spaceId,
          newFolder: {
            title: name.trim() || `Session ${today()}`,
            parentId: parent.folderId,
            color: scope === 'group' ? linkrColor(group?.color) : null,
            sessionDate: dated ? today() : null,
          },
          tabs: list,
        });
      }
      const spaceId = linked?.spaceId ?? parent.spaceId;
      if (scope === 'group' && group && result.folderId) await linkGroup(group.id, result.folderId);
      if (closeAfter) await chrome.tabs.remove(chosen.map((t) => t.id!));
      setDone({
        label: linked
          ? result.saved
            ? `Added ${result.saved} ${result.saved === 1 ? 'tab' : 'tabs'} to ${linked.title}`
            : `${linked.title} already has every tab`
          : `Saved ${result.saved} ${result.saved === 1 ? 'tab' : 'tabs'} as ${name.trim()}`,
        href: targetUrl(conn, { spaceId, folderId: result.folderId }),
      });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <div className="grid gap-4 p-4" role="status">
        <p className="flex items-center gap-2 font-medium">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
            <Check className="size-4" />
          </span>
          {done.label}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => open(done.href)}>
            <ExternalLink /> Open in Linkr
          </Button>
          <Button className="flex-1" onClick={() => window.close()}>
            Done
          </Button>
        </div>
      </div>
    );

  return (
    <div className="grid gap-3">
      <SubHeader title="Save tabs as a session" onBack={onBack} />
      <form onSubmit={submit} className="grid gap-3 px-3 pb-3">
        <div className="grid gap-1.5" role="radiogroup" aria-label="Which tabs">
          {tabs.group.length > 0 && (
            <ScopeOption
              checked={scope === 'group'}
              onChange={() => setScope('group')}
              title={`Tab group “${group?.title || 'Untitled'}”`}
              detail={`${tabs.group.length} ${tabs.group.length === 1 ? 'tab' : 'tabs'}`}
            />
          )}
          <ScopeOption
            checked={scope === 'window'}
            onChange={() => setScope('window')}
            title="All tabs in this window"
            detail={`${tabs.window.length} ${tabs.window.length === 1 ? 'tab' : 'tabs'}`}
          />
        </div>

        {linked ? (
          <p className="bg-muted rounded-lg p-2.5 text-sm">
            This group is linked to <span className="font-medium">{linked.title}</span>, so only its new tabs are added.{' '}
            <button type="button" className="underline" onClick={() => setAsNew(true)}>
              Save as a new session instead
            </button>
          </p>
        ) : (
          <>
            <Field label="Session name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Put it in">
              <TargetButton state={state} target={parent} onClick={() => setPicking(true)} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={dated} onCheckedChange={(value) => setDated(value === true)} />
              Date it today ({formatDate(today())})
            </label>
          </>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={closeAfter} onCheckedChange={(value) => setCloseAfter(value === true)} />
          Close these tabs afterwards
        </label>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" size="lg" disabled={busy || chosen.length === 0}>
          {busy && <Loader2 className="animate-spin" />}
          {linked ? `Add new tabs to ${linked.title}` : `Save ${chosen.length} ${chosen.length === 1 ? 'tab' : 'tabs'}`}
        </Button>
      </form>
    </div>
  );
}

function ScopeOption({
  checked,
  onChange,
  title,
  detail,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onChange}
      className={
        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ' +
        (checked ? 'border-primary bg-primary/5 ring-primary/20 ring-2' : 'hover:bg-accent')
      }
    >
      <span
        className={
          'flex size-4 shrink-0 items-center justify-center rounded-full border ' +
          (checked ? 'border-primary bg-primary' : '')
        }
      >
        {checked && <span className="bg-primary-foreground size-1.5 rounded-full" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="text-muted-foreground text-xs">{detail}</span>
    </button>
  );
}
