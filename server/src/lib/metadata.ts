import { parseHTML } from 'linkedom';
import { HttpError } from '../http.ts';
import { readLimited, safeFetch } from './safe-fetch.ts';

export type PageMetadata = {
  title: string | null;
  description: string | null;
  image: string | null;
};

const MAX_HTML_BYTES = 5 * 1024 * 1024;

export async function fetchPageHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const response = await safeFetch(url, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
  if (!response.ok) {
    throw new HttpError(502, `The page responded with HTTP ${response.status}`);
  }
  const type = response.headers.get('content-type') ?? '';
  if (type && !type.includes('html') && !type.includes('xml')) {
    throw new HttpError(422, 'The URL is not a web page');
  }
  const buffer = await readLimited(response, MAX_HTML_BYTES);
  const charset = /charset=([\w-]+)/i.exec(type)?.[1] ?? 'utf-8';
  let html: string;
  try {
    html = new TextDecoder(charset).decode(buffer);
  } catch {
    html = buffer.toString('utf8');
  }
  return { html, finalUrl: response.url || url };
}

// Same priority order as faved: Open Graph first, then standard tags, then the first image on the page.
export function extractMetadata(html: string, pageUrl: string): PageMetadata {
  const { document } = parseHTML(html);
  const attr = (selector: string, name = 'content') => {
    const value = document.querySelector(selector)?.getAttribute(name)?.trim();
    return value ? value : null;
  };
  const title = attr('meta[property="og:title"]') ?? (document.querySelector('title')?.textContent?.trim() || null);
  const description = attr('meta[property="og:description"]') ?? attr('meta[name="description"]');
  const rawImage = attr('meta[property="og:image"]') ?? attr('meta[name="twitter:image"]') ?? attr('img[src]', 'src');

  let image: string | null = null;
  if (rawImage) {
    try {
      image = new URL(rawImage, pageUrl).toString();
    } catch {
      image = null;
    }
  }
  return { title, description, image };
}

export async function fetchMetadata(url: string): Promise<PageMetadata> {
  const { html, finalUrl } = await fetchPageHtml(url);
  return extractMetadata(html, finalUrl);
}
