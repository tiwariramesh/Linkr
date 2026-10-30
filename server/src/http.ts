import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError, type ZodType } from 'zod';
import type { SessionUser } from './auth.ts';

export type AppEnv = {
  Variables: {
    user: SessionUser;
    // 'token' for the browser extension, which can't manage tokens or the account.
    via: 'session' | 'token';
  };
};

export class HttpError extends Error {
  status: ContentfulStatusCode;

  constructor(status: ContentfulStatusCode, message: string) {
    super(message);
    this.status = status;
  }
}

// Response shape the front end expects (it shows `message` as a toast).
export const success = (c: Context, message: string, data: object = {}, status: ContentfulStatusCode = 200) =>
  c.json({ success: true, message, data }, status);

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw result.error;
  }
  return result.data;
}

export function errorResponse(err: Error, c: Context) {
  if (err instanceof HttpError) {
    return c.json({ success: false, message: err.message }, err.status);
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path.join('.');
    return c.json({ success: false, message: field ? `${field}: ${issue.message}` : issue?.message }, 422);
  }
  // Better Auth API errors carry a status and a readable message.
  const apiError = err as Error & { statusCode?: number; body?: { message?: string } };
  if (typeof apiError.statusCode === 'number' && apiError.statusCode < 500) {
    return c.json(
      { success: false, message: apiError.body?.message ?? err.message },
      apiError.statusCode as ContentfulStatusCode
    );
  }
  console.error(err);
  return c.json({ success: false, message: 'Something went wrong on the server' }, 500);
}

// Small fixed-window limiter for login and registration, keyed by client IP.
export function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (c: Context) => {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || entry.resetAt < now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      if (hits.size > 10_000) {
        for (const [key, value] of hits) if (value.resetAt < now) hits.delete(key);
      }
      return;
    }
    entry.count++;
    if (entry.count > limit) {
      throw new HttpError(429, 'Too many attempts. Please wait a minute and try again.');
    }
  };
}
