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
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, REGISTRATION: 'open', MAX_UPLOAD_MB: '1' },
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

// A signed-in client that keeps its session cookie. Each one appears to come from its own address,
// so the sign-in rate limit (per address) doesn't trip as the suite grows.
let clients = 0;
async function signUp(name: string) {
  let cookie = '';
  const address = `203.0.113.${++clients}`;
  const call = async (method: string, url: string, body?: unknown) => {
    const response = await fetch(BASE + url, {
      method,
      headers: { 'content-type': 'application/json', cookie, 'x-forwarded-for': address },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = response.headers.getSetCookie();
    if (setCookies.length) cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  // Raw bodies (uploads) and raw responses (downloads).
  const send = async (method: string, url: string, body?: Buffer, type?: string, headers?: Record<string, string>) => {
    const response = await fetch(BASE + url, {
      method,
      headers: { cookie, ...(type ? { 'content-type': type } : {}), ...headers },
      body: body ? new Uint8Array(body) : undefined,
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const json = response.headers.get('content-type')?.includes('json') ? JSON.parse(bytes.toString()) : null;
    return { status: response.status, headers: response.headers, bytes, body: json };
  };
  const registered = await call('POST', '/api/auth/register', {
    username: name,
    email: `${name}@example.com`,
    password: 'password123',
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const me = await call('GET', '/api/me');
  return { call, send, user: me.body.user, spaceId: me.body.spaces[0].id as string, spaces: me.body.spaces };
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

  test('uploads stream to disk, serve byte ranges, take thumbnails and leave with their item', async () => {
    const { call, send, spaceId } = await signUp('uploader');
    const outsider = await signUp('outsider');
    const folder = (await call('POST', '/api/folders', { spaceId, title: 'Handouts' })).body;
    const upload = (name: string, bytes: Buffer, type: string, folderId?: string) =>
      send(
        'POST',
        `/api/items/upload?spaceId=${spaceId}&name=${encodeURIComponent(name)}${folderId ? `&folderId=${folderId}` : ''}`,
        bytes,
        type
      );

    const pdf = Buffer.concat([Buffer.from('%PDF-1.4' + String.fromCharCode(10)), Buffer.alloc(4000, 65)]);
    const slides = await upload('Week 3 slides.pdf', pdf, 'application/pdf', folder.id);
    assert.equal(slides.status, 201, JSON.stringify(slides.body));
    const item = slides.body;
    assert.deepEqual(
      [item.kind, item.title, item.folderId, item.file.name, item.file.mime, item.file.size],
      ['pdf', 'Week 3 slides', folder.id, 'Week 3 slides.pdf', 'application/pdf', pdf.length]
    );
    const fileUrl = `/api/files/${item.file.id}`;
    const whole = await send('GET', fileUrl);
    assert.equal(whole.status, 200);
    assert.ok(whole.bytes.equals(pdf));
    assert.match(whole.headers.get('content-disposition')!, /^inline;/);
    const part = await send('GET', fileUrl, undefined, undefined, { range: 'bytes=0-3' });
    assert.equal(part.status, 206);
    assert.equal(part.bytes.toString(), '%PDF');
    assert.equal(part.headers.get('content-range'), `bytes 0-3/${pdf.length}`);
    assert.equal((await outsider.send('GET', fileUrl)).status, 404);

    // Anything a browser could run is only ever offered as a sandboxed download.
    const page = (await upload('page.html', Buffer.from('<script>alert(1)</script>'), 'text/html')).body;
    assert.equal(page.kind, 'file');
    const served = await send('GET', `/api/files/${page.file.id}`);
    assert.equal(served.headers.get('content-type'), 'application/octet-stream');
    assert.match(served.headers.get('content-disposition')!, /^attachment;/);
    assert.match(served.headers.get('content-security-policy')!, /sandbox/);
    // No type from the browser: guessed from the extension.
    assert.equal((await upload('clip.mp4', Buffer.from('video'), '')).body.kind, 'video');

    const thumbnail = Buffer.from('not really a png');
    assert.equal((await send('PUT', `/api/items/${item.id}/thumbnail`, thumbnail, 'text/html')).status, 415);
    assert.equal((await send('PUT', `/api/items/${item.id}/thumbnail`, thumbnail, 'image/png')).status, 204);
    const preview = await send('GET', `/api/items/${item.id}/image`);
    assert.equal(preview.headers.get('content-type'), 'image/png');
    assert.ok(preview.bytes.equals(thumbnail));

    assert.equal((await upload('big.bin', Buffer.alloc(1024 * 1024 + 1), 'application/octet-stream')).status, 413);
    assert.equal((await upload('empty.txt', Buffer.alloc(0), 'text/plain')).status, 422);
    assert.equal((await call('PATCH', `/api/items/${item.id}`, { url: 'https://example.com' })).status, 422);
    assert.equal((await outsider.send('POST', `/api/items/upload?spaceId=${spaceId}&name=x.txt`, pdf)).status, 404);

    const stored = path.join(dataDir, 'files', item.id);
    assert.ok(fs.existsSync(stored));
    await call('POST', '/api/items/trash', { ids: [item.id] });
    await call('POST', '/api/items/purge', { ids: [item.id] });
    assert.ok(!fs.existsSync(stored), 'purging removes the file from disk');
    assert.equal((await send('GET', fileUrl)).status, 404);
  });

  test('rich notes are saved as editor documents on items and folders', async () => {
    const { call, spaceId } = await signUp('writer');
    const folder = (await call('POST', '/api/folders', { spaceId, title: 'Week 3' })).body;
    const doc = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
    });
    const saved = (await call('PATCH', `/api/folders/${folder.id}`, { body: doc, notes: 'Hi' })).body;
    assert.deepEqual([saved.body, saved.notes], [doc, 'Hi']);
    assert.equal((await call('PATCH', `/api/folders/${folder.id}`, { body: '{"type":"x"}' })).status, 422);

    const note = (await call('POST', '/api/items', { spaceId, kind: 'note', notes: 'x' })).body;
    assert.equal((await call('PATCH', `/api/items/${note.id}`, { body: doc, notes: 'Hi' })).body.body, doc);
    assert.equal((await call('GET', `/api/items/${note.id}/content`)).status, 404, 'notes have no reader copy');
  });

  test('highlights sync through the change log, stay private to the space and go with their item', async () => {
    const { call, spaceId } = await signUp('highlighter');
    const outsider = await signUp('peeker');
    const item = (await call('POST', '/api/items', { spaceId, kind: 'note', notes: 'An article' })).body;
    const before = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body.seq;

    const created = await call('POST', '/api/highlights', {
      itemId: item.id,
      quote: 'testing beats re-reading',
      prefix: 'Research shows that ',
      suffix: ' for long-term recall',
      start: 120,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const highlight = created.body;
    assert.deepEqual([highlight.color, highlight.comment, highlight.start], ['yellow', '', 120]);
    assert.equal((await call('POST', '/api/highlights', { itemId: item.id, quote: '' })).status, 422);
    assert.equal((await call('POST', '/api/highlights', { itemId: item.id, quote: 'x', color: 'red' })).status, 422);

    const edited = (await call('PATCH', `/api/highlights/${highlight.id}`, { color: 'green', comment: 'Ask why' }))
      .body;
    assert.deepEqual([edited.color, edited.comment, edited.quote], ['green', 'Ask why', 'testing beats re-reading']);
    const delta = (await call('GET', `/api/spaces/${spaceId}/changes?since=${before}`)).body;
    assert.deepEqual(
      delta.highlights.map((h: { id: string }) => h.id),
      [highlight.id]
    );

    // Other accounts can neither see nor change them, nor highlight items they can't reach.
    assert.equal((await outsider.call('PATCH', `/api/highlights/${highlight.id}`, { comment: 'hi' })).status, 404);
    assert.equal((await outsider.call('DELETE', `/api/highlights/${highlight.id}`)).status, 404);
    assert.equal((await outsider.call('POST', '/api/highlights', { itemId: item.id, quote: 'x' })).status, 404);

    const second = (await call('POST', '/api/highlights', { itemId: item.id, quote: 'second' })).body;
    assert.equal((await call('DELETE', `/api/highlights/${second.id}`)).status, 204);
    const afterDelete = (await call('GET', `/api/spaces/${spaceId}/changes?since=${before}`)).body;
    assert.deepEqual(afterDelete.deleted.highlights, [second.id]);

    await call('POST', '/api/items/trash', { ids: [item.id] });
    await call('POST', '/api/items/purge', { ids: [item.id] });
    assert.equal((await call('GET', `/api/spaces/${spaceId}/snapshot`)).body.highlights.length, 0);
  });

  test('full-text search finds titles, notes, highlights and session notes, and nothing in the Trash', async () => {
    const { call, spaceId } = await signUp('searcher');
    const outsider = await signUp('nosy');
    const search = async (q: string, who = call) =>
      (await who('GET', `/api/spaces/${spaceId}/search?q=${encodeURIComponent(q)}`)).body?.hits ?? [];
    const folder = (await call('POST', '/api/folders', { spaceId, title: 'Week 5 · Spacing', term: 'Term 2' })).body;
    await call('PATCH', `/api/folders/${folder.id}`, { notes: 'Bring index cards for the interleaving drill' });
    const note = (
      await call('POST', '/api/items', {
        spaceId,
        folderId: folder.id,
        kind: 'note',
        notes: 'Café quiz on mitochondria',
      })
    ).body;
    await call('POST', '/api/highlights', { itemId: note.id, quote: 'photosynthesis happens in chloroplasts' });

    const pick = (hits: { type: string; id: string; field: string }[]) => hits.map((h) => [h.type, h.id, h.field]);
    assert.deepEqual(pick(await search('mitochond')), [['item', note.id, 'title']], 'words match as prefixes');
    assert.deepEqual(pick(await search('cafe')), [['item', note.id, 'title']], 'accents are ignored');
    assert.deepEqual(pick(await search('chloroplasts')), [['item', note.id, 'highlight']]);
    const session = await search('interleaving drill');
    assert.deepEqual(pick(session), [['folder', folder.id, 'session']]);
    assert.match(session[0].snippet, /\u0002interleaving\u0003/);
    assert.deepEqual(pick(await search('term 2')), [['folder', folder.id, 'session']]);
    assert.deepEqual(await search('"); DROP TABLE items; --'), [], 'input is words only, never query syntax');
    assert.equal((await outsider.call('GET', `/api/spaces/${spaceId}/search?q=cafe`)).status, 404);

    await call('PATCH', `/api/items/${note.id}`, { notes: 'Renamed topic', title: 'Renamed topic' });
    assert.deepEqual(await search('mitochondria'), [], 'the index follows edits');
    assert.equal((await search('renamed')).length, 1);
    await call('POST', '/api/items/trash', { ids: [note.id] });
    assert.deepEqual(await search('renamed'), [], 'trashed items drop out');
  });

  test('run again copies a session for a new term, with its links, notes, files and highlights', async () => {
    const { call, send, spaceId } = await signUp('rerunner');
    const course = (await call('POST', '/api/folders', { spaceId, title: 'AI 101' })).body;
    const week = (
      await call('POST', '/api/folders', {
        spaceId,
        title: 'Week 1',
        parentId: course.id,
        sessionDate: '2026-02-11',
        term: 'Term 1',
      })
    ).body;
    const later = (await call('POST', '/api/folders', { spaceId, title: 'Week 2', parentId: course.id })).body;
    const extras = (await call('POST', '/api/folders', { spaceId, title: 'Extras', parentId: week.id, term: 'Term 1' }))
      .body;
    await call('PATCH', `/api/folders/${week.id}`, { notes: 'Plan: warm-up first' });
    const note = (await call('POST', '/api/items', { spaceId, folderId: week.id, kind: 'note', notes: 'Exit ticket' }))
      .body;
    await call('PATCH', `/api/items/${note.id}`, { description: 'kept' });
    const pdf = Buffer.from('%PDF-1.4 handout');
    const upload = (
      await send(
        'POST',
        `/api/items/upload?spaceId=${spaceId}&folderId=${extras.id}&name=handout.pdf`,
        pdf,
        'application/pdf'
      )
    ).body;
    await call('POST', '/api/highlights', { itemId: note.id, quote: 'Exit ticket' });

    const copied = await call('POST', `/api/folders/${week.id}/run-again`, {
      title: 'Week 1',
      sessionDate: '2026-07-15',
      term: 'Term 2',
    });
    assert.equal(copied.status, 201, JSON.stringify(copied.body));
    const copy = copied.body;
    assert.deepEqual(
      [copy.copiedFrom, copy.parentId, copy.sessionDate, copy.term, copy.notes],
      [week.id, course.id, '2026-07-15', 'Term 2', 'Plan: warm-up first']
    );
    assert.ok(week.position < copy.position && copy.position < later.position, 'placed right after the original');

    const snap = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body;
    const extrasCopy = snap.folders.find((f: { copiedFrom: string }) => f.copiedFrom === extras.id);
    assert.deepEqual([extrasCopy.parentId, extrasCopy.term, extrasCopy.sessionDate], [copy.id, 'Term 2', null]);
    const noteCopy = snap.items.find(
      (i: { folderId: string; kind: string }) => i.folderId === copy.id && i.kind === 'note'
    );
    assert.deepEqual([noteCopy.notes, noteCopy.description], ['Exit ticket', 'kept']);
    assert.equal(snap.highlights.filter((h: { itemId: string }) => h.itemId === noteCopy.id).length, 1);
    const fileCopy = snap.items.find((i: { folderId: string }) => i.folderId === extrasCopy.id);
    assert.notEqual(fileCopy.file.id, upload.file.id);
    assert.ok((await send('GET', `/api/files/${fileCopy.file.id}`)).bytes.equals(pdf), 'the file itself was copied');

    // A bare copy: one folder, blank notes, no highlights (a note item still keeps its text).
    const bare = (
      await call('POST', `/api/folders/${week.id}/run-again`, {
        title: 'Week 1 (blank)',
        subfolders: false,
        notes: false,
        highlights: false,
      })
    ).body;
    const after = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body;
    assert.equal(bare.notes, '');
    assert.equal(after.folders.filter((f: { parentId: string }) => f.parentId === bare.id).length, 0);
    const bareNote = after.items.find((i: { folderId: string }) => i.folderId === bare.id);
    assert.equal(bareNote.notes, 'Exit ticket');
    assert.equal(after.highlights.filter((h: { itemId: string }) => h.itemId === bareNote.id).length, 0);

    assert.equal(
      (await call('POST', `/api/folders/${week.id}/run-again`, { title: 'x', parentId: extras.id })).status,
      422
    );

    // The copies outlive their original.
    await call('POST', `/api/folders/${week.id}/trash`);
    assert.equal((await call('DELETE', `/api/folders/${week.id}`)).status, 204);
    const final = (await call('GET', `/api/spaces/${spaceId}/snapshot`)).body;
    assert.equal(final.folders.find((f: { id: string }) => f.id === copy.id).copiedFrom, null);
  });

  test('folders take a description and a cover photo, which go when replaced or deleted', async () => {
    const { call, send, spaceId } = await signUp('decorator');
    const outsider = await signUp('passerby');
    const folder = (await call('POST', '/api/folders', { spaceId, title: 'Week 6' })).body;
    const described = await call('PATCH', `/api/folders/${folder.id}`, {
      description: 'Feedback that moves learning forward',
      cover: 'gradient:sunset',
    });
    assert.deepEqual(
      [described.body.description, described.body.cover],
      ['Feedback that moves learning forward', 'gradient:sunset']
    );
    assert.equal((await call('PATCH', `/api/folders/${folder.id}`, { cover: 'upload:sneaky' })).status, 422);
    const hits = (await call('GET', `/api/spaces/${spaceId}/search?q=feedback`)).body.hits;
    assert.deepEqual(
      hits.map((h: { id: string }) => h.id),
      [folder.id],
      'descriptions are searchable'
    );

    const photo = Buffer.from('not really a png, but typed as one');
    assert.equal((await send('PUT', `/api/folders/${folder.id}/cover`, photo, 'image/svg+xml')).status, 415);
    const uploaded = await send('PUT', `/api/folders/${folder.id}/cover`, photo, 'image/png');
    assert.equal(uploaded.status, 200);
    assert.match(uploaded.body.cover, /^upload:/);
    const served = await send('GET', `/api/folders/${folder.id}/cover`);
    assert.equal(served.headers.get('content-type'), 'image/png');
    assert.ok(served.bytes.equals(photo));
    assert.equal((await outsider.send('GET', `/api/folders/${folder.id}/cover`)).status, 404);

    const dir = path.join(dataDir, 'covers', spaceId, folder.id);
    assert.ok(fs.existsSync(dir));
    await call('PATCH', `/api/folders/${folder.id}`, { cover: null });
    assert.ok(!fs.existsSync(dir), 'removing the cover deletes the photo');
    await send('PUT', `/api/folders/${folder.id}/cover`, photo, 'image/png');
    await call('POST', `/api/folders/${folder.id}/trash`);
    await call('DELETE', `/api/folders/${folder.id}`);
    assert.ok(!fs.existsSync(dir), 'deleting the folder deletes its photo');
  });

  test('shared spaces: invitations, roles, leaving, and private drafts', async () => {
    const host = await signUp('host');
    const guest = await signUp('guest');
    const stranger = await signUp('stranger');
    const team = (await host.call('POST', '/api/spaces', { name: 'Teaching team' })).body;
    const notificationsOf = async (who: typeof host) => (await who.call('GET', '/api/notifications')).body;

    assert.equal((await host.call('POST', `/api/spaces/${host.spaceId}/invites`, { login: 'guest' })).status, 422);
    assert.equal(
      (await host.call('POST', `/api/spaces/${team.id}/invites`, { login: 'nobody-by-that-name' })).status,
      404
    );
    assert.equal((await guest.call('POST', `/api/spaces/${team.id}/invites`, { login: 'stranger' })).status, 404);
    const invite = (await host.call('POST', `/api/spaces/${team.id}/invites`, { login: 'GUEST', role: 'viewer' })).body;
    assert.equal(invite.username, 'guest');
    const [inviteNote] = await notificationsOf(guest);
    assert.deepEqual(
      [inviteNote.kind, inviteNote.data.inviteId, inviteNote.data.spaceName],
      ['invite', invite.id, 'Teaching team']
    );
    assert.equal(
      (await guest.call('GET', `/api/spaces/${team.id}/snapshot`)).status,
      404,
      'not a member until accepted'
    );
    assert.equal(
      (await stranger.call('POST', `/api/invites/${invite.id}/accept`)).status,
      404,
      'only the invitee can answer'
    );

    assert.equal((await guest.call('POST', `/api/invites/${invite.id}/accept`)).body.spaceId, team.id);
    assert.equal((await guest.call('GET', `/api/spaces/${team.id}/snapshot`)).status, 200);
    assert.equal(
      (await guest.call('POST', '/api/folders', { spaceId: team.id, title: 'x' })).status,
      403,
      'viewers read only'
    );
    assert.equal((await notificationsOf(host))[0].kind, 'joined');
    assert.equal((await notificationsOf(guest))[0].data.answer, 'accepted');

    const members = (await guest.call('GET', `/api/spaces/${team.id}/members`)).body;
    assert.deepEqual(
      members.members.map((m: { username: string; role: string }) => [m.username, m.role]),
      [
        ['host', 'owner'],
        ['guest', 'viewer'],
      ]
    );
    assert.deepEqual(members.invites, [], 'only owners see pending invitations');
    assert.equal((await stranger.call('GET', `/api/spaces/${team.id}/members`)).status, 404);

    await host.call('PATCH', `/api/spaces/${team.id}/members/${guest.user.id}`, { role: 'editor' });
    const folder = await guest.call('POST', '/api/folders', { spaceId: team.id, title: 'Week 8' });
    assert.equal(folder.status, 201, 'editors can add');
    assert.equal(
      (await host.call('PATCH', `/api/spaces/${team.id}/members/${host.user.id}`, { role: 'editor' })).status,
      422
    );
    assert.equal(
      (await host.call('DELETE', `/api/spaces/${team.id}/members/${host.user.id}`)).status,
      422,
      'the last owner can’t leave'
    );

    // Drafts are private to each member.
    await host.call('PUT', `/api/folders/${folder.body.id}/draft`, { body: null, notes: 'Only I can see this' });
    assert.equal((await host.call('GET', `/api/folders/${folder.body.id}/draft`)).body.notes, 'Only I can see this');
    assert.equal((await guest.call('GET', `/api/folders/${folder.body.id}/draft`)).body, null);
    assert.equal((await stranger.call('GET', `/api/folders/${folder.body.id}/draft`)).status, 404);

    // Declining leaves no membership.
    const second = (await host.call('POST', `/api/spaces/${team.id}/invites`, { login: 'stranger@example.com' })).body;
    await stranger.call('POST', `/api/invites/${second.id}/decline`);
    assert.equal((await stranger.call('GET', `/api/spaces/${team.id}/snapshot`)).status, 404);

    assert.equal(
      (await guest.call('DELETE', `/api/spaces/${team.id}/members/${guest.user.id}`)).status,
      204,
      'members can leave'
    );
    assert.equal((await guest.call('GET', `/api/spaces/${team.id}/snapshot`)).status, 404);
  });

  type PublicPage = {
    folder: { title: string; description: string; notes: { text: string } | null };
    items: { kind: string; notes: string }[];
  };

  test('sending a link or note to another account, and public read-only folder pages', async () => {
    const sender = await signUp('sender');
    const reader = await signUp('reader');
    const note = (
      await sender.call('POST', '/api/items', { spaceId: sender.spaceId, kind: 'note', notes: 'Exit ticket ideas' })
    ).body;
    assert.equal((await sender.call('POST', `/api/items/${note.id}/send`, { to: 'sender' })).status, 422);
    assert.equal(
      (await sender.call('POST', `/api/items/${note.id}/send`, { to: 'reader', message: 'For Friday' })).status,
      201
    );
    const [sent] = (await reader.call('GET', '/api/notifications')).body;
    assert.deepEqual(
      [sent.kind, sent.data.from, sent.data.title, sent.data.message],
      ['sent', 'sender', 'Exit ticket ideas', 'For Friday']
    );
    const saved = (await reader.call('POST', `/api/notifications/${sent.id}/save`, {})).body;
    assert.deepEqual(
      [saved.spaceId, saved.folderId, saved.notes],
      [reader.spaceId, null, 'Exit ticket ideas'],
      'saved to their Inbox'
    );
    assert.equal((await reader.call('POST', '/api/notifications/read', {})).status, 204);
    assert.ok((await reader.call('GET', '/api/notifications')).body.every((n: { readAt: string | null }) => n.readAt));

    // Public page for a folder.
    const folder = (await sender.call('POST', '/api/folders', { spaceId: sender.spaceId, title: 'Week 9' })).body;
    await sender.call('PATCH', `/api/folders/${folder.id}`, { notes: 'Session plan', description: 'Feedback' });
    await sender.call('POST', '/api/items', {
      spaceId: sender.spaceId,
      folderId: folder.id,
      kind: 'note',
      notes: 'Handout text',
    });
    const link = (
      await sender.call('POST', '/api/items', {
        spaceId: sender.spaceId,
        folderId: folder.id,
        url: 'https://example.com/',
      })
    ).body;
    await sender.call('PATCH', `/api/items/${link.id}`, { notes: 'private: ask Sam' });
    const shared = (await sender.call('PATCH', `/api/folders/${folder.id}/share`, { enabled: true })).body;
    assert.match(shared.shareToken, /^[\w-]{20,40}$/);
    const publicPage = async (token: string) => {
      const response = await fetch(`${BASE}/api/public/${token}`);
      return {
        status: response.status,
        robots: response.headers.get('x-robots-tag'),
        body: (response.ok ? await response.json() : null) as PublicPage,
      };
    };
    let page = await publicPage(shared.shareToken);
    assert.equal(page.status, 200, 'no sign-in needed');
    assert.match(page.robots!, /noindex/);
    assert.deepEqual(
      [page.body.folder.title, page.body.folder.description, page.body.folder.notes],
      ['Week 9', 'Feedback', null]
    );
    assert.equal(page.body.items.length, 2);
    assert.equal(page.body.items.find((i) => i.kind === 'link')!.notes, '', 'notes on links stay private');
    assert.equal(page.body.items.find((i) => i.kind === 'note')!.notes, 'Handout text');

    await sender.call('PATCH', `/api/folders/${folder.id}/share`, { enabled: true, notes: true });
    page = await publicPage(shared.shareToken);
    assert.equal(page.body.folder.notes!.text, 'Session plan', 'session notes when chosen');
    assert.equal((await reader.call('PATCH', `/api/folders/${folder.id}/share`, { enabled: false })).status, 404);

    await sender.call('PATCH', `/api/folders/${folder.id}/share`, { enabled: false });
    assert.equal((await publicPage(shared.shareToken)).status, 404, 'turning sharing off kills the link');
    const again = (await sender.call('PATCH', `/api/folders/${folder.id}/share`, { enabled: true })).body;
    assert.notEqual(again.shareToken, shared.shareToken, 'turning it back on makes a new link');
    assert.equal((await publicPage('not-a-real-token-at-all-xx')).status, 404);
  });

  test('a shared space outlives its owner’s account, with the longest-standing member as owner', async () => {
    const founder = await signUp('founder');
    const member = await signUp('member');
    const team = (await founder.call('POST', '/api/spaces', { name: 'Department' })).body;
    const invite = (await founder.call('POST', `/api/spaces/${team.id}/invites`, { login: 'member' })).body;
    await member.call('POST', `/api/invites/${invite.id}/accept`);
    assert.equal((await founder.call('DELETE', '/api/me', { password: 'password123' })).status, 204);
    const after = (await member.call('GET', `/api/spaces/${team.id}/members`)).body.members;
    assert.deepEqual(
      after.map((m: { username: string; role: string }) => [m.username, m.role]),
      [['member', 'owner']]
    );
  });

  test('the browser extension connects with a token that saves tabs but cannot manage the account', async () => {
    const { call, user } = await signUp('extension');
    const created = await call('POST', '/api/extension/tokens', { name: 'Chrome on Windows' });
    assert.equal(created.status, 201);
    const { token, info } = created.body;
    assert.match(token, /^lk_/);
    // The extension sends no cookie, and its Origin is chrome-extension://, which the site would refuse.
    const ext = async (method: string, url: string, body?: unknown, key = token) => {
      const response = await fetch(BASE + url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
          origin: 'chrome-extension://abcdefghijklmnop',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    };

    const state = (await ext('GET', '/api/extension/state')).body;
    assert.equal(state.user.username, user.username);
    const spaceId = state.spaces[0].id;

    // A tab group becomes a session folder, in tab order, without duplicates.
    const a = 'https://example.com/one';
    const b = 'https://example.com/two#part';
    const saved = await ext('POST', '/api/extension/tabs', {
      spaceId,
      newFolder: { title: 'Week 1', color: 'blue', sessionDate: '2026-11-03' },
      tabs: [
        { url: a, title: 'One' },
        { url: b, title: 'Two' },
        { url: a, title: 'One again' },
      ],
    });
    assert.equal(saved.status, 201, JSON.stringify(saved.body));
    assert.equal(saved.body.saved, 2);
    const group = (await ext('GET', `/api/extension/folders/${saved.body.folderId}/tabs`)).body;
    assert.deepEqual([group.folder.title, group.folder.color], ['Week 1', 'blue']);
    assert.deepEqual(
      group.tabs.map((tab: { url: string }) => tab.url),
      [a, b]
    );
    const state2 = (await ext('GET', '/api/extension/state')).body;
    assert.equal(state2.folders.find((f: { id: string }) => f.id === saved.body.folderId).sessionDate, '2026-11-03');

    // "Already saved" ignores a trailing slash or #fragment.
    const found = (await ext('GET', `/api/extension/lookup?url=${encodeURIComponent(a + '/')}`)).body.saved;
    assert.deepEqual(
      found.map((hit: { folderId: string }) => hit.folderId),
      [saved.body.folderId]
    );

    // Regular saving works with a token too.
    assert.equal((await ext('POST', '/api/items', { spaceId, kind: 'note', notes: 'From the extension' })).status, 201);

    // But a token can't manage tokens or the account.
    assert.equal((await ext('GET', '/api/extension/tokens')).status, 403);
    assert.equal((await ext('POST', '/api/extension/tokens', { name: 'another' })).status, 403);
    assert.equal(
      (await ext('PATCH', '/api/me/password', { currentPassword: 'x', newPassword: 'y'.repeat(10) })).status,
      403
    );
    assert.equal((await ext('DELETE', '/api/me', { password: 'password123' })).status, 403);
    assert.equal((await ext('GET', '/api/extension/state', undefined, 'lk_not-a-real-token')).status, 401);

    // Someone else sees none of it.
    const other = await signUp('extension_other');
    assert.notEqual((await other.call('GET', `/api/extension/folders/${saved.body.folderId}/tabs`)).status, 200);
    assert.deepEqual((await other.call('GET', `/api/extension/lookup?url=${encodeURIComponent(a)}`)).body.saved, []);

    // Disconnecting the browser stops the token at once.
    assert.deepEqual(
      (await call('GET', '/api/extension/tokens')).body.map((t: { id: string; lastUsedAt: string | null }) => [
        t.id,
        !!t.lastUsedAt,
      ]),
      [[info.id, true]]
    );
    assert.equal((await call('DELETE', `/api/extension/tokens/${info.id}`)).status, 204);
    assert.equal((await ext('GET', '/api/extension/state')).status, 401);
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
