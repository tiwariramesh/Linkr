import { Hono } from 'hono';
import { config } from '../config.ts';
import type { AppEnv } from '../http.ts';
import { isRegistrationOpen } from './account.ts';

let latestRelease: { version: string | null; checkedAt: number } = { version: null, checkedAt: 0 };

async function getLatestVersion(): Promise<string | null> {
  if (Date.now() - latestRelease.checkedAt < 6 * 60 * 60 * 1000) return latestRelease.version;
  try {
    const response = await fetch(`https://api.github.com/repos/${config.githubRepo}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'Linkr' },
      signal: AbortSignal.timeout(5000),
    });
    const release = response.ok ? ((await response.json()) as { tag_name?: string }) : null;
    latestRelease = { version: release?.tag_name?.replace(/^v/, '') || null, checkedAt: Date.now() };
  } catch {
    latestRelease = { version: null, checkedAt: Date.now() };
  }
  return latestRelease.version;
}

const isNewer = (latest: string, installed: string) => {
  const a = latest.split('.').map(Number);
  const b = installed.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
};

// Public: the sign-in page needs to know whether registration is open.
export const appInfoRoutes = new Hono<AppEnv>().get('/app-info', async (c) => {
  const latest = await getLatestVersion();
  return c.json({
    version: config.version,
    latestVersion: latest,
    updateAvailable: latest ? isNewer(latest, config.version) : null,
    registrationOpen: isRegistrationOpen(),
  });
});
