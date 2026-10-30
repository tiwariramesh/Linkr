import {
  getConnection,
  getTarget,
  groupColor,
  isSavable,
  linkGroup,
  linkr,
  LinkrError,
  originPattern,
  resolveTarget,
  setConnection,
  targetName,
  type Connection,
  type Target,
} from './lib/linkr.ts';

// The background worker: connecting to a Linkr server, right-click and keyboard saves, and opening a
// folder as a tab group (the popup closes as soon as new tabs take focus, so that happens here).

type Message =
  | { type: 'connect'; server: string }
  | { type: 'connect-code'; server: string; token: string }
  | { type: 'connect-token'; token: string }
  | { type: 'open-group'; folderId: string }
  | { type: 'target-changed' };

// ---- Connecting ----

// Checks a token against the server and keeps it.
async function finishConnecting(server: string, token: string) {
  const state = await linkr.state({ server, token, username: '' });
  const connection: Connection = { server, token, username: state.user.username };
  await setConnection(connection);
  await chrome.storage.session.remove('pending');
  await refreshMenus();
  return connection;
}

// Runs inside the Linkr connect page (isolated from the page's own scripts) and passes the token the
// page creates to this worker. Only ever injected into the tab this worker opened, on the server's origin.
function connectHelper() {
  const w = window as Window & { linkrHelper?: boolean };
  if (w.linkrHelper) return;
  w.linkrHelper = true;
  const post = (type: string, message?: string) =>
    window.postMessage({ source: 'linkr-extension', type, message }, location.origin);
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data as { source?: string; type?: string; token?: string };
    if (data?.source !== 'linkr-page') return;
    if (data.type === 'hello') post('ready');
    if (data.type === 'token' && data.token) {
      const reply = (await chrome.runtime.sendMessage({ type: 'connect-token', token: data.token })) as
        { ok: boolean; message?: string } | undefined;
      post(reply?.ok ? 'connected' : 'failed', reply?.message);
    }
  });
  post('ready');
}

chrome.tabs.onUpdated.addListener(async (tabId, change, tab) => {
  if (change.status !== 'complete') return;
  const { pending } = await chrome.storage.session.get('pending');
  const job = pending as { tabId: number; server: string } | undefined;
  if (!job || job.tabId !== tabId || !tab.url?.startsWith(job.server + '/')) return;
  await chrome.scripting.executeScript({ target: { tabId }, func: connectHelper }).catch(() => {});
});

// ---- Saving without the popup ----

async function currentTarget(): Promise<{ connection: Connection; target: Target; name: string } | null> {
  const connection = await getConnection();
  if (!connection) return null;
  const state = await linkr.state();
  const target = resolveTarget(state, await getTarget());
  return target ? { connection, target, name: targetName(state, target) } : null;
}

// A short tick (or "!") on the toolbar icon, since right-click and shortcut saves have no window.
async function flash(tabId: number | undefined, ok: boolean, title: string) {
  await chrome.action.setBadgeBackgroundColor({ color: ok ? '#16a34a' : '#dc2626' });
  await chrome.action.setBadgeText({ text: ok ? '✓' : '!', tabId });
  await chrome.action.setTitle({ title, tabId });
  setTimeout(() => {
    void chrome.action.setBadgeText({ text: '', tabId });
    void chrome.action.setTitle({ title: 'Save to Linkr (Alt+Shift+L)', tabId });
  }, 2500);
}

async function quickSave(tabId: number | undefined, save: (target: Target) => Promise<unknown>) {
  try {
    const where = await currentTarget();
    if (!where) {
      await flash(tabId, false, 'Connect Linkr first: click the Linkr icon');
      return;
    }
    await save(where.target);
    await flash(tabId, true, `Saved to ${where.name}`);
  } catch (error) {
    await flash(tabId, false, error instanceof LinkrError ? error.message : 'Couldn’t save to Linkr');
  }
}

async function refreshMenus() {
  await chrome.contextMenus.removeAll();
  const connected = !!(await getConnection());
  let name = 'Linkr';
  if (connected) {
    try {
      name = (await currentTarget())?.name ?? name;
    } catch {
      // offline: keep the generic titles
    }
  }
  const to = connected ? `to ${name}` : 'to Linkr';
  chrome.contextMenus.create({ id: 'save-page', title: `Save page ${to}`, contexts: ['page'] });
  chrome.contextMenus.create({ id: 'save-link', title: `Save link ${to}`, contexts: ['link'] });
  chrome.contextMenus.create({
    id: 'save-selection',
    title: `Save selection as a note ${to}`,
    contexts: ['selection'],
  });
}

chrome.runtime.onInstalled.addListener(() => void refreshMenus());
chrome.runtime.onStartup.addListener(() => void refreshMenus());

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const pageUrl = info.pageUrl ?? tab?.url;
  if (info.menuItemId === 'save-page' && isSavable(pageUrl)) {
    void quickSave(tab?.id, (target) => linkr.saveLink(target, pageUrl, tab?.title ?? '', ''));
  }
  if (info.menuItemId === 'save-link' && isSavable(info.linkUrl)) {
    const url = info.linkUrl;
    void quickSave(tab?.id, (target) => linkr.saveLink(target, url, '', ''));
  }
  if (info.menuItemId === 'save-selection' && info.selectionText) {
    const source = isSavable(pageUrl) ? `\n\nFrom ${tab?.title ? `${tab.title} — ` : ''}${pageUrl}` : '';
    const text = info.selectionText;
    void quickSave(tab?.id, (target) => linkr.saveNote(target, `“${text.trim()}”${source}`));
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'save-page') return;
  const active = tab ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!isSavable(active?.url)) {
    await flash(active?.id, false, 'Only web pages can be saved');
    return;
  }
  await quickSave(active.id, (target) => linkr.saveLink(target, active.url!, active.title ?? '', ''));
});

// ---- A folder as a tab group ----

async function openGroup(folderId: string) {
  const { folder, tabs } = await linkr.folderTabs(folderId);
  if (!tabs.length) throw new LinkrError(404, `“${folder.title}” has no links to open`);
  const window = await chrome.windows.getLastFocused();
  const created = [];
  for (const [index, tab] of tabs.entries()) {
    created.push(await chrome.tabs.create({ url: tab.url, active: index === 0, windowId: window.id }));
  }
  const [first, ...rest] = created.map((tab) => tab.id!);
  const groupId: number = await chrome.tabs.group({
    tabIds: [first, ...rest],
    createProperties: { windowId: window.id },
  });
  await chrome.tabGroups.update(groupId, { title: folder.title, color: groupColor(folder.color) });
  await linkGroup(groupId, folder.id);
  return tabs.length;
}

// ---- Messages from the popup and the connect helper ----

chrome.runtime.onMessage.addListener((message: Message, sender, reply) => {
  const run = async () => {
    switch (message.type) {
      case 'connect': {
        const tab = await chrome.tabs.create({ url: `${message.server}/connect-extension` });
        await chrome.storage.session.set({ pending: { tabId: tab.id, server: message.server } });
        return { ok: true };
      }
      case 'connect-code': {
        const granted = await chrome.permissions.contains({ origins: [originPattern(message.server)] });
        if (!granted) return { ok: false, message: 'Allow access to your Linkr first' };
        await finishConnecting(message.server, message.token.trim());
        return { ok: true };
      }
      case 'connect-token': {
        // Only from the tab we opened, on the server's own origin.
        const { pending } = await chrome.storage.session.get('pending');
        const job = pending as { tabId: number; server: string } | undefined;
        if (!job || sender.tab?.id !== job.tabId || sender.origin !== job.server) {
          return { ok: false, message: 'This page didn’t come from the Linkr extension' };
        }
        await finishConnecting(job.server, message.token);
        return { ok: true };
      }
      case 'open-group':
        return { ok: true, opened: await openGroup(message.folderId) };
      case 'target-changed':
        await refreshMenus();
        return { ok: true };
    }
  };
  run()
    .then(reply)
    .catch((error) => reply({ ok: false, message: error instanceof LinkrError ? error.message : String(error) }));
  return true; // reply asynchronously
});
