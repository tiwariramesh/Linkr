import { count, inArray, notInArray } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { auth, publicUser, type SessionUser } from '../auth.ts';
import { config } from '../config.ts';
import { db } from '../db/client.ts';
import { items, spaceMembers, spaces, user } from '../db/schema.ts';
import { HttpError, parseInput, rateLimiter, type AppEnv } from '../http.ts';
import { userSpaces } from '../lib/data.ts';
import { clearItemImages } from '../lib/images.ts';

const limitAuthAttempts = rateLimiter(10, 60_000);

const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Use only letters, numbers, dots and underscores');

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

// Better Auth sets session cookies on its own response headers; copy them onto ours.
function forwardCookies(c: Context, headers: Headers) {
  for (const cookie of headers.getSetCookie()) {
    c.header('set-cookie', cookie, { append: true });
  }
}

export function isRegistrationOpen() {
  if (config.registration === 'open') return true;
  const row = db.select({ total: count() }).from(user).get();
  return (row?.total ?? 0) === 0;
}

// Public routes: no session needed.
export const publicAccountRoutes = new Hono<AppEnv>()
  .post('/auth/login', async (c) => {
    limitAuthAttempts(c);
    const { login, password } = parseInput(
      z.object({
        login: z.string().trim().min(1, 'Username or email is required'),
        password: z.string().min(1, 'Password is required'),
      }),
      await c.req.json()
    );
    const result = login.includes('@')
      ? await auth.api.signInEmail({
          body: { email: login, password },
          headers: c.req.raw.headers,
          returnHeaders: true,
        })
      : await auth.api.signInUsername({
          body: { username: login, password },
          headers: c.req.raw.headers,
          returnHeaders: true,
        });
    if (!result.response?.user) throw new HttpError(401, 'Invalid username or password');
    forwardCookies(c, result.headers);
    return c.json({ user: publicUser(result.response.user as SessionUser) });
  })
  .post('/auth/register', async (c) => {
    limitAuthAttempts(c);
    if (!isRegistrationOpen()) {
      throw new HttpError(403, 'Registration is closed on this Linkr server');
    }
    const input = parseInput(
      z.object({ username: usernameSchema, email: z.email('Enter a valid email address'), password: passwordSchema }),
      await c.req.json()
    );
    const result = await auth.api.signUpEmail({
      body: {
        name: input.username,
        email: input.email.toLowerCase(),
        password: input.password,
        username: input.username,
        displayUsername: input.username,
      },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    forwardCookies(c, result.headers);
    return c.json({ user: publicUser(result.response.user as SessionUser) }, 201);
  })
  .post('/auth/logout', async (c) => {
    const result = await auth.api.signOut({ headers: c.req.raw.headers, returnHeaders: true }).catch(() => null);
    if (result) forwardCookies(c, result.headers);
    return c.body(null, 204);
  });

// Routes for the signed-in user.
export const accountRoutes = new Hono<AppEnv>()
  .get('/me', (c) => c.json({ user: publicUser(c.var.user), spaces: userSpaces(c.var.user.id) }))
  .patch('/me/username', async (c) => {
    const { username } = parseInput(z.object({ username: usernameSchema }), await c.req.json());
    await auth.api.updateUser({
      body: { username, displayUsername: username } as Record<string, string>,
      headers: c.req.raw.headers,
    });
    return c.body(null, 204);
  })
  .patch('/me/password', async (c) => {
    const input = parseInput(
      z.object({ currentPassword: z.string().min(1, 'Current password is required'), newPassword: passwordSchema }),
      await c.req.json()
    );
    const result = await auth.api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    forwardCookies(c, result.headers);
    return c.body(null, 204);
  })
  .delete('/me', async (c) => {
    const { password } = parseInput(
      z.object({ password: z.string().min(1, 'Enter your password to confirm') }),
      await c.req.json()
    );
    // Better Auth checks the password before deleting; memberships go with the user (ON DELETE CASCADE).
    const result = await auth.api.deleteUser({ body: { password }, headers: c.req.raw.headers, returnHeaders: true });
    // Spaces nobody belongs to any more are deleted with their contents.
    const orphaned = db
      .select({ id: spaces.id })
      .from(spaces)
      .where(notInArray(spaces.id, db.select({ id: spaceMembers.spaceId }).from(spaceMembers)))
      .all()
      .map((row) => row.id);
    if (orphaned.length) {
      const itemIds = db
        .select({ id: items.id })
        .from(items)
        .where(inArray(items.spaceId, orphaned))
        .all()
        .map((row) => row.id);
      db.delete(spaces).where(inArray(spaces.id, orphaned)).run();
      clearItemImages(itemIds);
    }
    forwardCookies(c, result.headers);
    return c.body(null, 204);
  });
