const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Same format as the server's IDs, so new rows can appear on screen before the server confirms them.
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let id = '';
  for (const byte of bytes) id += ALPHABET[byte % 62];
  return id;
}
