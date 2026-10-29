import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');

const port = Number(process.env.PORT ?? 8080);
const dataDir = path.resolve(repoRoot, process.env.DATA_DIR ?? 'data');
fs.mkdirSync(dataDir, { recursive: true });

const baseUrl = (process.env.BASE_URL ?? `http://localhost:${port}`).replace(/\/+$/, '');

// Every origin the app is reached from (custom domain, LAN address, localhost).
const trustedOrigins = [
  ...new Set([
    baseUrl,
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    ...(process.env.TRUSTED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  ]),
];

// Self-hosters shouldn't have to generate a secret: create one on first run and keep it in the data folder.
function loadAuthSecret(): string {
  if (process.env.AUTH_SECRET) {
    return process.env.AUTH_SECRET;
  }
  const secretPath = path.join(dataDir, 'auth-secret.key');
  if (!fs.existsSync(secretPath)) {
    fs.writeFileSync(secretPath, crypto.randomBytes(48).toString('base64url'), { mode: 0o600 });
  }
  return fs.readFileSync(secretPath, 'utf8').trim();
}

const appPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

export const config = {
  port,
  host: process.env.HOST ?? '127.0.0.1',
  baseUrl,
  trustedOrigins,
  dataDir,
  dbPath: path.join(dataDir, 'linkr.db'),
  imageDir: path.join(dataDir, 'img'),
  fileDir: path.join(dataDir, 'files'),
  coverDir: path.join(dataDir, 'covers'),
  // Cloudflare's free plan rejects request bodies over 100 MB, so that is the default.
  maxUploadBytes: Math.max(1, Number(process.env.MAX_UPLOAD_MB) || 100) * 1024 * 1024,
  frontendDist: path.join(repoRoot, 'web', 'dist'),
  migrationsDir: path.resolve(import.meta.dirname, '../drizzle'),
  authSecret: loadAuthSecret(),
  // 'open' lets anyone register; 'closed' allows only the very first account (the owner).
  registration: process.env.REGISTRATION === 'closed' ? 'closed' : 'open',
  version: appPackage.version as string,
  githubRepo: 'tiwariramesh/Linkr',
};
