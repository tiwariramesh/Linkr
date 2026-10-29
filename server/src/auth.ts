import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { username } from 'better-auth/plugins';
import { config } from './config.ts';
import { db } from './db/client.ts';
import * as schema from './db/schema.ts';

export const auth = betterAuth({
  appName: 'Linkr',
  baseURL: config.baseUrl,
  basePath: '/api/auth',
  secret: config.authSecret,
  trustedOrigins: config.trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  user: {
    deleteUser: { enabled: true },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // extend the session once a day while it's in use
  },
  advanced: {
    cookiePrefix: 'linkr',
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 32,
    }),
  ],
});

export type SessionUser = typeof auth.$Infer.Session.user;

export const publicUser = (user: SessionUser) => ({
  id: user.id,
  username: user.displayUsername || user.username || user.name,
  email: user.email,
});
