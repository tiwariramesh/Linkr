import { count, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { auth, publicUser, type SessionUser } from '../auth.ts';
import { config } from '../config.ts';
import { db } from '../db/client.ts';
import { items, user } from '../db/schema.ts';
import { HttpError, parseInput, rateLimiter, success, type AppEnv } from '../http.ts';
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

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z
  .object({
    username: usernameSchema,
    email: z.email('Enter a valid email address'),
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1, 'Current password is required'),
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((data) => data.password === data.confirm_password, {
    message: "Passwords don't match",
    path: ['confirm_password'],
  });

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
    const { username, password } = parseInput(loginSchema, await c.req.json());
    const result = username.includes('@')
      ? await auth.api.signInEmail({
          body: { email: username, password },
          headers: c.req.raw.headers,
          returnHeaders: true,
        })
      : await auth.api.signInUsername({
          body: { username, password },
          headers: c.req.raw.headers,
          returnHeaders: true,
        });
    if (!result.response?.user) throw new HttpError(401, 'Invalid username or password');
    forwardCookies(c, result.headers);
    return success(c, 'Signed in.', { user: publicUser(result.response.user as SessionUser) });
  })
  .post('/auth/register', async (c) => {
    limitAuthAttempts(c);
    if (!isRegistrationOpen()) {
      throw new HttpError(403, 'Registration is closed on this Linkr server');
    }
    const input = parseInput(registerSchema, await c.req.json());
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
    return success(c, 'Welcome to Linkr!', { user: publicUser(result.response.user as SessionUser) }, 201);
  })
  .post('/auth/logout', async (c) => {
    const result = await auth.api.signOut({ headers: c.req.raw.headers, returnHeaders: true }).catch(() => null);
    if (result) forwardCookies(c, result.headers);
    return success(c, 'Signed out.');
  });

// Routes for the signed-in user.
export const accountRoutes = new Hono<AppEnv>()
  .get('/settings/user', (c) => success(c, 'User retrieved.', { user: publicUser(c.var.user) }))
  .patch('/settings/username', async (c) => {
    const { username } = parseInput(z.object({ username: usernameSchema }), await c.req.json());
    await auth.api.updateUser({
      body: { username, displayUsername: username } as Record<string, string>,
      headers: c.req.raw.headers,
    });
    return success(c, 'Username updated.');
  })
  .patch('/settings/password', async (c) => {
    const input = parseInput(passwordChangeSchema, await c.req.json());
    const result = await auth.api.changePassword({
      body: { currentPassword: input.current_password, newPassword: input.password, revokeOtherSessions: true },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    forwardCookies(c, result.headers);
    return success(c, 'Password changed. Your other devices have been signed out.');
  })
  .delete('/settings/user', async (c) => {
    const { password } = parseInput(
      z.object({ password: z.string().min(1, 'Enter your password to confirm') }),
      await c.req.json()
    );
    const itemIds = db
      .select({ id: items.id })
      .from(items)
      .where(eq(items.userId, c.var.user.id))
      .all()
      .map((row) => row.id);
    const result = await auth.api.deleteUser({
      body: { password },
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    // Rows are removed by ON DELETE CASCADE; cached images live on disk.
    clearItemImages(itemIds);
    forwardCookies(c, result.headers);
    return success(c, 'Your account and all its data have been deleted.');
  });
