import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch, type Response } from 'undici';
import { HttpError } from '../http.ts';

// Saved URLs are user input. Refuse to connect to anything that isn't a public internet address,
// so nobody can make the server probe the owner's router, LAN or cloud metadata endpoints.
const blocked = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
] as const) {
  blocked.addSubnet(address, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPublicAddress(mapped[1]);
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return !blocked.check(address, 'ipv6');
  return false;
}

// Runs on every connection, including each redirect hop, so a public URL can't redirect inward.
const guardedLookup: typeof dns.lookup = ((hostname: string, options: any, callback: any) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = addresses as unknown as dns.LookupAddress[];
    const unsafe = list.find((entry) => !isPublicAddress(entry.address));
    if (unsafe || list.length === 0) {
      return callback(Object.assign(new Error(`Blocked address for ${hostname}`), { code: 'EBLOCKED' }));
    }
    if (options?.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}) as typeof dns.lookup;

const agent = new Agent({
  connect: { lookup: guardedLookup, timeout: 10_000 },
  headersTimeout: 15_000,
  bodyTimeout: 15_000,
});

const USER_AGENT = 'Mozilla/5.0 (compatible; LinkrBot/0.1; +https://github.com/tiwariramesh/Linkr)';

export function assertHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(422, 'Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(422, 'Only http and https URLs are supported');
  }
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw new HttpError(422, 'This address cannot be fetched');
  }
  return url;
}

export async function safeFetch(raw: string, accept: string): Promise<Response> {
  const url = assertHttpUrl(raw);
  try {
    return await fetch(url, {
      dispatcher: agent,
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en;q=0.9,*;q=0.5' },
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause;
    if (cause?.code === 'EBLOCKED') {
      throw new HttpError(422, 'This address cannot be fetched');
    }
    throw new HttpError(502, `Could not reach ${url.hostname}`);
  }
}

// Reads at most `limit` bytes so a huge or endless response can't exhaust memory.
export async function readLimited(response: Response, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  if (!response.body) return Buffer.alloc(0);
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) {
      await response.body.cancel().catch(() => {});
      throw new HttpError(413, 'The response is too large');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
