import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

export type Article = { html: string; text: string; byline: string | null; words: number };

const MAX_ARTICLE_HTML = 1_000_000;
// Shorter than this it's a landing page or an app, not something to read.
const MIN_WORDS = 80;

const absoluteUrl = (value: string | null, base: string) => {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

// The page's main text as simple HTML (Firefox Reader View's algorithm), with links made absolute.
// The app sanitises it again before showing it.
export function extractArticle(html: string, pageUrl: string): Article | null {
  let article: ReturnType<Readability['parse']>;
  try {
    const { document } = parseHTML(html);
    // linkedom's document stands in for the browser DOM Readability expects.
    article = new Readability(document as unknown as ConstructorParameters<typeof Readability>[0]).parse();
  } catch {
    return null;
  }
  if (!article?.content) return null;

  const { document } = parseHTML(`<!doctype html><html><body>${article.content}</body></html>`);
  for (const element of document.querySelectorAll('script, style, iframe, object, embed, form, link, meta')) {
    element.remove();
  }
  for (const attribute of ['href', 'src']) {
    for (const element of document.querySelectorAll(`[${attribute}]`)) {
      const url = absoluteUrl(element.getAttribute(attribute), pageUrl);
      if (url) element.setAttribute(attribute, url);
      else element.removeAttribute(attribute);
    }
  }
  for (const element of document.querySelectorAll('[srcset]')) element.removeAttribute('srcset');

  const content = document.body.innerHTML;
  if (content.length > MAX_ARTICLE_HTML) return null;
  const text = (article.textContent ?? '').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  if (words < MIN_WORDS) return null;
  return { html: content, text, byline: article.byline?.trim() || null, words };
}

// Sites opt out of being shown inside other pages with X-Frame-Options or CSP frame-ancestors.
export function isFrameable(headers: { get(name: string): string | null }): boolean {
  if (headers.get('x-frame-options')) return false;
  const ancestors = /frame-ancestors\s+([^;]*)/i.exec(headers.get('content-security-policy') ?? '')?.[1].trim();
  return !ancestors || ancestors.split(/\s+/).includes('*');
}
