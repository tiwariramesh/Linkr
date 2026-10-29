// End-to-end API tests: starts a real server on a throwaway database and talks to it over HTTP.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { generateKeyBetween } from 'fractional-indexing';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linkr-test-'));
let server: ChildProcess;

before(async () => {
  server = spawn(process.execPath, ['src/index.ts'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, REGISTRATION: 'open' },
    stdio: 'ignore',
  });
  // Generous: first start on Windows can be slow while antivirus scans freshly loaded files.
  for (let i = 0; i < 600; i++) {
    try {
      if ((await fetch(`${BASE}/api/app-info`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start');
});

after(async () => {
  // Windows keeps the database file locked until the process has actually exited.
  const exited = new Promise((resolve) => server.once('exit', resolve));
  server.kill();
  await exited;
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

// A signed-in client that keeps its session cookie.
async function signUp(name: string) {
  let cookie = '';
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await fetch(BASE + url, {
      method,
      headers: { 'content-type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = response.headers.getSetCookie();
    if (setCookies.length) cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const registered = await call('POST', '/api/auth/register', {
    username: name,
    email: `${name}@example.com`,
    password: 'password123',
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const me = await call('GET', '/api/me');
  return { call, user: me.body.user, spaceId: me.body.spaces[0].id as string, spaces: me.body.spaces };
}

describe('Linkr API', () => {
  test('a new account gets one Personal space it owns', async () => {
    const ann = await signUp('ann');
    assert.equal(ann.spaces.length, 1);
    assert.deepEqual([ann.spaces[0].name, ann.spaces[0].kind, ann.spaces[0].role], ['Personal', 'personal', 'owner']);
  });

  test('folders nest, refuse to move inside themselves, and sync through the change log', async () => {
    const { call, spaceId } = await signUp('folders');
    const start = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body.seq;

    const course = (await call('POST', '/api/folders', { spaceId, title: 'AI 101', color: 'orange' })).body;
    const week1 = (await call('POST', '/api/folders', { spaceId, title: 'Week 1', parentId: course.id })).body;
    const week2 = (await call('POST', '/api/folders', { spaceId, title: 'Week 2', parentId: course.id })).body;
    assert.ok(week1.position < week2.position, 'new folders go to the end');

    const loop = await call('PATCH', `/api/folders/${course.id}`, { parentId: week1.id });
    assert.equal(loop.status, 422);

    await call('PATCH', `/api/folders/${week1.id}`, {
      sessionDate: '2026-11-02',
      term: 'Term 1',
      view: { layout: 'list' },
    });
    const delta = (await call('GET', `/api/spaces/${spaceId}/changes?since=${start}`)).body;
    assert.equal(delta.folders.length, 3);
    const updated = delta.folders.find((f: { id: string }) => f.id === week1.id);
    assert.deepEqual([updated.sessionDate, updated.term, updated.view.layout], ['2026-11-02', 'Term 1', 'list']);
  });

  test('items: notes, links, ordering, moving, trash and purge', async () => {
    const { call, spaceId } = await signUp('items');
    const folder = (await call('POST', '/api/folders', { spaceId, title: 'Session' })).body;

    const note = (await call('POST', '/api/items', { spaceId, kind: 'note', notes: 'Key takeaway\nmore text' })).body;
    assert.equal(note.title, 'Key takeaway');
    assert.equal(note.folderId, null, 'items without a folder land in the Inbox');

    const link = (await call('POST', '/api/items', { spaceId, url: 'https://www.youtube.com/watch?v=abc' })).body;
    assert.equal(link.kind, 'video');
    assert.equal(link.title, 'youtube.com', 'placeholder title until the preview arrives');
    assert.equal(link.fetchStatus, 'pending');

    const bad = await call('POST', '/api/items', { spaceId, url: 'javascript:alert(1)' });
    assert.equal(bad.status, 422);

    await call('POST', '/api/items/move', { ids: [note.id, link.id], folderId: folder.id });
    let items = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body.items;
    const [movedNote, movedLink] = [note.id, link.id].map((id) => items.find((i: { id: string }) => i.id === id));
    assert.equal(movedNote.folderId, folder.id);
    assert.ok(movedNote.position < movedLink.position, 'moved items keep the order they were sent in');

    // Drag-and-drop sends a key between neighbours.
    const between = generateKeyBetween(null, movedNote.position);
    assert.equal((await call('PATCH', `/api/items/${link.id}`, { position: between })).body.position, between);
    assert.equal((await call('PATCH', `/api/items/${link.id}`, { position: '!!' })).status, 422);

    await call('POST', '/api/items/trash', { ids: [note.id] });
    items = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body.items;
    assert.ok(items.find((i: { id: string }) => i.id === note.id).deletedAt);
    await call('POST', '/api/items/restore', { ids: [note.id] });

    // Purge only removes items that are already in the Trash.
    await call('POST', '/api/items/purge', { ids: [note.id] });
    assert.equal((await call('GET', `/api/spaces/${spaceId}/snapshot`)).body.items.length, 2);
    await call('POST', '/api/items/trash', { ids: [note.id] });
    const before = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body.seq;
    await call('POST', '/api/items/purge', { ids: [note.id] });
    const delta = (await call('GET', `/api/spaces/${spaceId}/changes?since=${before}`)).body;
    assert.deepEqual(delta.deleted.items, [note.id]);
  });

  test('tags are per space, unique by name, and removed from items when deleted', async () => {
    const { call, spaceId } = await signUp('tagger');
    const tag = (await call('POST', '/api/tags', { spaceId, title: 'Exam' })).body;
    assert.equal((await call('POST', '/api/tags', { spaceId, title: 'exam' })).status, 409);
    const item = (await call('POST', '/api/items', { spaceId, kind: 'note', notes: 'x', tagIds: [tag.id] })).body;
    assert.deepEqual(item.tagIds, [tag.id]);
    await call('DELETE', `/api/tags/${tag.id}`);
    const after = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body;
    assert.deepEqual(after.items[0].tagIds, []);
  });

  test("nobody can read or change another account's space", async () => {
    const owner = await signUp('owner');
    const other = await signUp('intruder');
    const folder = (await owner.call('POST', '/api/folders', { spaceId: owner.spaceId, title: 'Private' })).body;
    const item = (await owner.call('POST', '/api/items', { spaceId: owner.spaceId, kind: 'note', notes: 'secret' }))
      .body;
    const tag = (await owner.call('POST', '/api/tags', { spaceId: owner.spaceId, title: 'mine' })).body;

    const attempts = [
      other.call('GET', `/api/spaces/${owner.spaceId}/snapshot`),
      other.call('GET', `/api/spaces/${owner.spaceId}/changes?since=0`),
      other.call('POST', '/api/folders', { spaceId: owner.spaceId, title: 'x' }),
      other.call('PATCH', `/api/folders/${folder.id}`, { title: 'hacked' }),
      other.call('PATCH', `/api/items/${item.id}`, { title: 'hacked' }),
      other.call('POST', '/api/items/trash', { ids: [item.id] }),
      other.call('GET', `/api/items/${item.id}/image`),
      other.call('DELETE', `/api/tags/${tag.id}`),
      other.call('DELETE', `/api/spaces/${owner.spaceId}`),
    ];
    for (const response of await Promise.all(attempts)) assert.equal(response.status, 404);

    // Their own item can't be moved into, or tagged with, the owner's folder or tag.
    const own = (await other.call('POST', '/api/items', { spaceId: other.spaceId, kind: 'note', notes: 'n' })).body;
    assert.equal((await other.call('PATCH', `/api/items/${own.id}`, { folderId: folder.id })).status, 422);
    assert.equal((await other.call('PATCH', `/api/items/${own.id}`, { tagIds: [tag.id] })).status, 422);
  });

  test('bookmark import turns browser folders into Linkr folders', async () => {
    const { call, spaceId } = await signUp('importer');
    const html = `<DL><p><DT><H3>Bar</H3><DL><p>
      <DT><A HREF="https://a.example/" ADD_DATE="1700000000" TAGS="docs">A</A>
      <DT><H3>Deep</H3><DL><p><DT><A HREF="https://b.example/">B</A></DL><p>
      <DT><A HREF="javascript:void(0)">skip</A></DL><p></DL>`;
    const form = new FormData();
    form.append('file', new Blob([html], { type: 'text/html' }), 'bookmarks.html');
    const response = await fetch(`${BASE}/api/spaces/${spaceId}/import/bookmarks`, {
      method: 'POST',
      body: form,
      headers: { cookie: await loginCookie('importer') },
    });
    const result = (await response.json()) as { imported: number; skipped: number };
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual([result.imported, result.skipped], [2, 1]);

    const snap = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body;
    const byId = new Map(snap.folders.map((f: { id: string }) => [f.id, f]));
    const pathOf = (id: string): string => {
      const f = byId.get(id) as { title: string; parentId: string | null };
      return f.parentId ? `${pathOf(f.parentId)}/${f.title}` : f.title;
    };
    const paths = snap.items.map(
      (i: { title: string; folderId: string }) => `${i.title} @ ${pathOf(i.folderId).replace(/^[^/]+/, 'ROOT')}`
    );
    assert.deepEqual(paths.sort(), ['A @ ROOT/Bar', 'B @ ROOT/Bar/Deep']);
    assert.equal(snap.tags[0].title, 'docs');
  });

  test('deleting an account removes its Personal space and everything in it', async () => {
    const { call, spaceId } = await signUp('leaver');
    await call('POST', '/api/items', { spaceId, kind: 'note', notes: 'bye' });
    assert.equal((await call('DELETE', '/api/me', { password: 'wrong-password' })).status, 400);
    assert.equal((await call('DELETE', '/api/me', { password: 'password123' })).status, 204);
    const again = await signUp('checker');
    assert.equal((await again.call('GET', `/api/spaces/${spaceId}/snapshot`)).status, 404);
  });
});

async function loginCookie(name: string) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login: name, password: 'password123' }),
  });
  return response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}
