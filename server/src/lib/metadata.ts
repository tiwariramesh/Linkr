import { parseHTML } from 'linkedom';
import { HttpError } from '../http.ts';
import { readLimited, safeFetch } from './safe-fetch.ts';

export type LinkKind = 'link' | 'video' | 'pdf' | 'image';

export type LinkMetadata = {
  kind: LinkKind;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  siteName: string;
};

const MAX_HTML_BYTES = 5 * 1024 * 1024;

const hostName = (url: string) => new URL(url).hostname.replace(/^www\./, '');

export function isVideoUrl(url: string): boolean {
  try {
    const { hostname, pathname, searchParams } = new URL(url);
    const host = hostname.replace(/^(www|m)\./, '');
    if (host === 'youtu.be') return pathname.length > 1;
    if (host === 'youtube.com')
      return pathname === '/watch' ? searchParams.has('v') : /^\/(shorts|live|embed)\//.test(pathname);
    if (host === 'vimeo.com') return /^\/\d+/.test(pathname);
    return false;
  } catch {
    return false;
  }
}

// Open Graph first, then standard tags, then the first image on the page.
export function extractMetadata(html: string, pageUrl: string): Omit<LinkMetadata, 'kind'> {
  const { document } = parseHTML(html);
  const attr = (selector: string, name = 'content') => {
    const value = document.querySelector(selector)?.getAttribute(name)?.trim();
    return value ? value : null;
  };
  const absolute = (value: string | null) => {
    if (!value) return null;
    try {
      const url = new URL(value, pageUrl);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
    } catch {
      return null;
    }
  };
  const title = attr('meta[property="og:title"]') ?? (document.querySelector('title')?.textContent?.trim() || null);
  return {
    title,
    description: attr('meta[property="og:description"]') ?? attr('meta[name="description"]'),
    image: absolute(attr('meta[property="og:image"]') ?? attr('meta[name="twitter:image"]') ?? attr('img[src]', 'src')),
    favicon: absolute(
      attr('link[rel="icon"]', 'href') ??
        attr('link[rel="shortcut icon"]', 'href') ??
        attr('link[rel="apple-touch-icon"]', 'href') ??
        '/favicon.ico'
    ),
    siteName: attr('meta[property="og:site_name"]') ?? hostName(pageUrl),
  };
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  const response = await safeFetch(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new HttpError(502, `The page responded with HTTP ${response.status}`);
  }
  const finalUrl = response.url || url;
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  const siteName = hostName(finalUrl);
  const favicon = new URL('/favicon.ico', finalUrl).toString();

  if (type.includes('application/pdf')) {
    await response.body?.cancel().catch(() => {});
    const file = decodeURIComponent(new URL(finalUrl).pathname.split('/').pop() ?? '').replace(/\.pdf$/i, '');
    return { kind: 'pdf', title: file.trim() || siteName, description: null, image: null, favicon, siteName };
  }
  if (type.startsWith('image/')) {
    await response.body?.cancel().catch(() => {});
    return { kind: 'image', title: null, description: null, image: finalUrl, favicon, siteName };
  }
  if (type && !type.includes('html') && !type.includes('xml')) {
    await response.body?.cancel().catch(() => {});
    return { kind: 'link', title: null, description: null, image: null, favicon, siteName };
  }

  const buffer = await readLimited(response, MAX_HTML_BYTES);
  const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? 'utf-8';
  let html: string;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = buffer.toString('utf8');
  }
  return { kind: isVideoUrl(finalUrl) ? 'video' : 'link', ...extractMetadata(html, finalUrl) };
}
