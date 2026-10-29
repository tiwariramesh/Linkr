import type { Item } from '@/lib/types';

// Tracking parameters that don't change which page a link points to.
const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|ref_src|igshid|si)$/i;

// The form of a URL used to tell whether two links are the same page: no "www.", no #fragment,
// no trailing slash, no tracking parameters, query parameters in a fixed order.
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${path}${url.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

// Other saved copies of the same link in the space (not in the Trash).
export function sameLinkElsewhere(items: Record<string, Item>, item: Pick<Item, 'id' | 'url'>): Item[] {
  if (!item.url) return [];
  const key = normalizeUrl(item.url);
  return Object.values(items).filter(
    (other) => other.id !== item.id && !other.deletedAt && other.url && normalizeUrl(other.url) === key
  );
}
