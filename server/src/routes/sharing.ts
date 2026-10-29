import crypto from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { publicUser } from '../auth.ts';
import { db, nowIso } from '../db/client.ts';
import { drafts, folders, items, notifications, spaceInvites, spaceMembers, spaces, user } from '../db/schema.ts';
import { mutate, notifyUser } from '../events.ts';
import { HttpError, parseInput, rateLimiter, type AppEnv } from '../http.ts';
import { loadFolder, loadItem, requireRole, type Role } from '../lib/access.ts';
import { folderWire, getItemWire } from '../lib/data.ts';
import { documentSchema, idSchema, newId } from '../lib/ids.ts';
import { enqueueFetch, placeholderTitle } from '../lib/link-queue.ts';
import { isVideoUrl } from '../lib/metadata.ts';
import { itemPositionsAtTop } from '../lib/positions.ts';

// Sharing: members and roles in a space, invitations, notifications, sending a link or note to another
// account, private drafts, and public read-only folder pages (served by routes/public.ts).

const roleSchema = z.enum(['editor', 'viewer']);
const loginSchema = z.string().trim().min(1, 'Enter a username or email').max(200);
const limitSends = rateLimiter(30, 60_000);

const usernameOf = (row: { username: string | null; displayUsername: string | null; name: string }) =>
  row.displayUsername ?? row.username ?? row.name;

// An account by username or email (exact, case-insensitive): never a partial match, so accounts can't be listed.
function findAccount(login: string) {
  const value = login.trim().replace(/^@/, '').toLowerCase();
  const found = db
    .select()
    .from(user)
    .where(value.includes('@') ? eq(user.email, value) : eq(user.username, value))
    .get();
  if (!found) throw new HttpError(404, 'No account has that username or email');
  return found;
}

function notify(userId: string, kind: 'invite' | 'sent' | 'joined', data: Record<string, unknown>) {
  db.insert(notifications).values({ id: newId(), userId, kind, data, createdAt: nowIso() }).run();
  notifyUser(userId, { type: 'notifications' });
}

const owners = (spaceId: string) =>
  db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.role, 'owner')))
    .all()
    .map((row) => row.userId);

function members(spaceId: string) {
  return db
    .select({ userId: spaceMembers.userId, role: spaceMembers.role, joinedAt: spaceMembers.createdAt, account: user })
    .from(spaceMembers)
    .innerJoin(user, eq(user.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(asc(spaceMembers.createdAt))
    .all()
    .map((row) => ({ userId: row.userId, username: usernameOf(row.account), role: row.role, joinedAt: row.joinedAt }));
}

// A space must always keep an owner.
function assertNotLastOwner(spaceId: string, userId: string) {
  const list = owners(spaceId);
  if (list.length === 1 && list[0] === userId) {
    throw new HttpError(422, 'A space needs an owner: make someone else an owner first');
  }
}

export const sharingRoutes = new Hono<AppEnv>()
  // ---- Members and invitations ----
  .get('/spaces/:id/members', (c) => {
    const spaceId = c.req.param('id');
    const role = requireRole(c.var.user.id, spaceId, 'viewer');
    const invites =
      role === 'owner'
        ? db
            .select({ id: spaceInvites.id, role: spaceInvites.role, createdAt: spaceInvites.createdAt, account: user })
            .from(spaceInvites)
            .innerJoin(user, eq(user.id, spaceInvites.userId))
            .where(eq(spaceInvites.spaceId, spaceId))
            .all()
            .map((row) => ({ id: row.id, username: usernameOf(row.account), role: row.role, createdAt: row.createdAt }))
        : [];
    return c.json({ members: members(spaceId), invites });
  })
  .post('/spaces/:id/invites', async (c) => {
    const spaceId = c.req.param('id');
    const userId = c.var.user.id;
    requireRole(userId, spaceId, 'owner');
    const input = parseInput(z.object({ login: loginSchema, role: roleSchema.default('editor') }), await c.req.json());
    const space = db.select().from(spaces).where(eq(spaces.id, spaceId)).get()!;
    if (space.kind === 'personal')
      throw new HttpError(422, 'Personal spaces can’t be shared; create a shared space instead');
    const invitee = findAccount(input.login);
    const already = db
      .select()
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, invitee.id)))
      .get();
    if (already) throw new HttpError(409, `${usernameOf(invitee)} is already in this space`);
    const id = newId();
    db.insert(spaceInvites)
      .values({ id, spaceId, userId: invitee.id, role: input.role, invitedBy: userId, createdAt: nowIso() })
      .onConflictDoUpdate({ target: [spaceInvites.spaceId, spaceInvites.userId], set: { role: input.role } })
      .run();
    const invite = db
      .select()
      .from(spaceInvites)
      .where(and(eq(spaceInvites.spaceId, spaceId), eq(spaceInvites.userId, invitee.id)))
      .get()!;
    if (invite.id === id) {
      notify(invitee.id, 'invite', {
        inviteId: id,
        spaceId,
        spaceName: space.name,
        role: input.role,
        from: publicUser(c.var.user).username,
      });
    }
    return c.json(
      { id: invite.id, username: usernameOf(invitee), role: invite.role, createdAt: invite.createdAt },
      201
    );
  })
  .delete('/spaces/:id/invites/:inviteId', (c) => {
    const spaceId = c.req.param('id');
    requireRole(c.var.user.id, spaceId, 'owner');
    db.delete(spaceInvites)
      .where(and(eq(spaceInvites.id, c.req.param('inviteId')), eq(spaceInvites.spaceId, spaceId)))
      .run();
    return c.body(null, 204);
  })
  .post('/invites/:id/:answer{accept|decline}', (c) => {
    const userId = c.var.user.id;
    const invite = db
      .select()
      .from(spaceInvites)
      .where(and(eq(spaceInvites.id, c.req.param('id')), eq(spaceInvites.userId, userId)))
      .get();
    if (!invite) throw new HttpError(404, 'This invitation is no longer open');
    const accepted = c.req.param('answer') === 'accept';
    db.transaction((tx) => {
      tx.delete(spaceInvites).where(eq(spaceInvites.id, invite.id)).run();
      if (accepted) {
        tx.insert(spaceMembers)
          .values({ spaceId: invite.spaceId, userId, role: invite.role, createdAt: nowIso() })
          .onConflictDoNothing()
          .run();
      }
    });
    // The invitation's notification now records the answer.
    for (const row of db.select().from(notifications).where(eq(notifications.userId, userId)).all()) {
      if (row.kind === 'invite' && row.data.inviteId === invite.id) {
        db.update(notifications)
          .set({ data: { ...row.data, answer: accepted ? 'accepted' : 'declined' }, readAt: nowIso() })
          .where(eq(notifications.id, row.id))
          .run();
      }
    }
    notifyUser(userId, { type: 'notifications' });
    if (accepted) {
      const space = db.select().from(spaces).where(eq(spaces.id, invite.spaceId)).get()!;
      const who = publicUser(c.var.user).username;
      for (const owner of owners(invite.spaceId))
        notify(owner, 'joined', { spaceId: space.id, spaceName: space.name, who });
      notifyUser(userId, { type: 'spaces' });
    }
    return c.json({ spaceId: accepted ? invite.spaceId : null });
  })
  .patch('/spaces/:id/members/:userId', async (c) => {
    const spaceId = c.req.param('id');
    const memberId = c.req.param('userId');
    requireRole(c.var.user.id, spaceId, 'owner');
    const { role } = parseInput(z.object({ role: z.enum(['owner', 'editor', 'viewer']) }), await c.req.json());
    if (role !== 'owner') assertNotLastOwner(spaceId, memberId);
    const updated = db
      .update(spaceMembers)
      .set({ role: role as Role })
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, memberId)))
      .returning()
      .get();
    if (!updated) throw new HttpError(404, 'Not a member of this space');
    notifyUser(memberId, { type: 'spaces' });
    return c.json({ members: members(spaceId) });
  })
  // Owners remove members; anyone can remove themselves (leave).
  .delete('/spaces/:id/members/:userId', (c) => {
    const spaceId = c.req.param('id');
    const memberId = c.req.param('userId');
    const self = memberId === c.var.user.id;
    requireRole(c.var.user.id, spaceId, self ? 'viewer' : 'owner');
    if (db.select().from(spaces).where(eq(spaces.id, spaceId)).get()?.kind === 'personal') {
      throw new HttpError(422, 'Personal spaces can’t be left');
    }
    assertNotLastOwner(spaceId, memberId);
    db.delete(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, memberId)))
      .run();
    // Their private drafts in this space go too.
    const folderIds = db
      .select({ id: folders.id })
      .from(folders)
      .where(eq(folders.spaceId, spaceId))
      .all()
      .map((row) => row.id);
    if (folderIds.length) {
      db.delete(drafts)
        .where(and(eq(drafts.userId, memberId), inArray(drafts.folderId, folderIds)))
        .run();
    }
    notifyUser(memberId, { type: 'spaces' });
    return c.body(null, 204);
  })

  // ---- Notifications ----
  .get('/notifications', (c) => {
    const rows = db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, c.var.user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50)
      .all();
    return c.json(
      rows.map((row) => ({ id: row.id, kind: row.kind, data: row.data, readAt: row.readAt, createdAt: row.createdAt }))
    );
  })
  .post('/notifications/read', async (c) => {
    const { ids } = parseInput(z.object({ ids: z.array(idSchema).max(500).optional() }), await c.req.json());
    const mine = eq(notifications.userId, c.var.user.id);
    db.update(notifications)
      .set({ readAt: nowIso() })
      .where(and(mine, isNull(notifications.readAt), ids ? inArray(notifications.id, ids) : undefined))
      .run();
    notifyUser(c.var.user.id, { type: 'notifications' });
    return c.body(null, 204);
  })
  .delete('/notifications/:id', (c) => {
    db.delete(notifications)
      .where(and(eq(notifications.id, c.req.param('id')), eq(notifications.userId, c.var.user.id)))
      .run();
    notifyUser(c.var.user.id, { type: 'notifications' });
    return c.body(null, 204);
  })

  // ---- Sending a link or note to another account ----
  // The recipient gets a notification and chooses whether to save it; nothing lands in their space uninvited.
  .post('/items/:id/send', async (c) => {
    limitSends(c);
    const item = loadItem(c.var.user.id, c.req.param('id'), 'viewer');
    const input = parseInput(
      z.object({ to: loginSchema, message: z.string().trim().max(1000).default('') }),
      await c.req.json()
    );
    const recipient = findAccount(input.to);
    if (recipient.id === c.var.user.id) throw new HttpError(422, 'That’s your own account');
    if (item.fileId) throw new HttpError(422, 'Files can’t be sent yet; send a link or a note');
    notify(recipient.id, 'sent', {
      from: publicUser(c.var.user).username,
      message: input.message,
      kind: item.kind === 'note' ? 'note' : 'link',
      title: item.title,
      url: item.url,
      description: item.description,
      siteName: item.siteName,
      notes: item.kind === 'note' ? item.notes : '',
      body: item.kind === 'note' ? item.body : null,
    });
    return c.json({ to: usernameOf(recipient) }, 201);
  })
  .post('/notifications/:id/save', async (c) => {
    const userId = c.var.user.id;
    const note = db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, c.req.param('id')), eq(notifications.userId, userId)))
      .get();
    if (!note || note.kind !== 'sent') throw new HttpError(404, 'Nothing to save here');
    const input = parseInput(
      z.object({ spaceId: idSchema.optional(), folderId: idSchema.nullable().default(null) }),
      await c.req.json()
    );
    // Default: the Inbox of the recipient's Personal space.
    const spaceId =
      input.spaceId ??
      db
        .select({ id: spaces.id })
        .from(spaces)
        .innerJoin(spaceMembers, eq(spaceMembers.spaceId, spaces.id))
        .where(and(eq(spaceMembers.userId, userId), eq(spaces.kind, 'personal')))
        .orderBy(asc(spaces.createdAt))
        .get()?.id;
    if (!spaceId) throw new HttpError(422, 'Choose a space to save it in');
    requireRole(userId, spaceId, 'editor');
    if (input.folderId) loadFolder(userId, input.folderId, 'editor');
    const data = note.data as Record<string, string | null>;
    const isNote = data.kind === 'note';
    const url = data.url ?? '';
    const id = newId();
    const now = nowIso();
    mutate(spaceId, userId, (tx, touch) => {
      tx.insert(items)
        .values({
          id,
          spaceId,
          folderId: input.folderId,
          kind: isNote ? 'note' : isVideoUrl(url) ? 'video' : 'link',
          title: data.title || (isNote ? 'Untitled note' : placeholderTitle(url)),
          url: isNote ? '' : url,
          description: data.description ?? '',
          notes: data.notes ?? '',
          body: data.body && documentSchema.safeParse(data.body).success ? data.body : null,
          siteName: data.siteName ?? '',
          position: itemPositionsAtTop(tx, spaceId, input.folderId, 1)[0],
          fetchStatus: isNote ? 'done' : 'pending',
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      touch({ entity: 'item', id });
    });
    if (!isNote && url) enqueueFetch(id);
    db.update(notifications)
      .set({ data: { ...note.data, savedItemId: id, savedSpaceId: spaceId }, readAt: now })
      .where(eq(notifications.id, note.id))
      .run();
    notifyUser(userId, { type: 'notifications' });
    return c.json(getItemWire(id), 201);
  })

  // ---- Private drafts ----
  .get('/folders/:id/draft', (c) => {
    const folder = loadFolder(c.var.user.id, c.req.param('id'), 'viewer');
    const draft = db
      .select()
      .from(drafts)
      .where(and(eq(drafts.folderId, folder.id), eq(drafts.userId, c.var.user.id)))
      .get();
    return c.json(draft ? { body: draft.body, notes: draft.notes, updatedAt: draft.updatedAt } : null);
  })
  .put('/folders/:id/draft', async (c) => {
    const userId = c.var.user.id;
    const folder = loadFolder(userId, c.req.param('id'), 'viewer');
    const input = parseInput(
      z.object({ body: documentSchema.nullable(), notes: z.string().max(200_000) }),
      await c.req.json()
    );
    const row = { ...input, updatedAt: nowIso() };
    db.insert(drafts)
      .values({ folderId: folder.id, userId, ...row })
      .onConflictDoUpdate({ target: [drafts.folderId, drafts.userId], set: row })
      .run();
    // The same person's other devices refresh it.
    notifyUser(userId, { type: 'draft', folderId: folder.id });
    return c.json({ body: row.body, notes: row.notes, updatedAt: row.updatedAt });
  })

  // ---- Public read-only folder pages ----
  .patch('/folders/:id/share', async (c) => {
    const folder = loadFolder(c.var.user.id, c.req.param('id'), 'editor');
    const input = parseInput(z.object({ enabled: z.boolean(), notes: z.boolean().optional() }), await c.req.json());
    // A new link each time sharing is turned on, so an old link stays dead once turned off.
    const shareToken = input.enabled ? (folder.shareToken ?? crypto.randomBytes(18).toString('base64url')) : null;
    mutate(folder.spaceId, c.var.user.id, (tx, touch) => {
      tx.update(folders)
        .set({ shareToken, ...(input.notes !== undefined ? { shareNotes: input.notes } : {}), updatedAt: nowIso() })
        .where(eq(folders.id, folder.id))
        .run();
      touch({ entity: 'folder', id: folder.id });
    });
    return c.json(folderWire(db.select().from(folders).where(eq(folders.id, folder.id)).get()!));
  });

// After an account is deleted, its shared spaces must still have an owner: in any space whose members
// are now all editors or viewers, the longest-standing member becomes the owner. (Spaces left with no
// members at all are deleted by the account route.)
export function repairOwnerlessSpaces() {
  const withOwner = new Set(
    db
      .select({ spaceId: spaceMembers.spaceId })
      .from(spaceMembers)
      .where(eq(spaceMembers.role, 'owner'))
      .all()
      .map((row) => row.spaceId)
  );
  const all = db.select().from(spaceMembers).orderBy(asc(spaceMembers.createdAt)).all();
  const promoted = new Set<string>();
  for (const member of all) {
    if (withOwner.has(member.spaceId) || promoted.has(member.spaceId)) continue;
    promoted.add(member.spaceId);
    db.update(spaceMembers)
      .set({ role: 'owner' })
      .where(and(eq(spaceMembers.spaceId, member.spaceId), eq(spaceMembers.userId, member.userId)))
      .run();
    notifyUser(member.userId, { type: 'spaces' });
  }
}
