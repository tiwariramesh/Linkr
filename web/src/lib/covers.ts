import type { Folder } from '@/lib/types';

// Built-in cover gradients (stored as "gradient:<name>"). Uploaded photos are "upload:<token>".
export const COVER_GRADIENTS: Record<string, string> = {
  linkr: 'linear-gradient(135deg, #ffcc00 0%, #ff9500 50%, #f04b00 100%)',
  sunset: 'linear-gradient(135deg, #ff9a8b 0%, #ff6a88 55%, #ff99ac 100%)',
  dusk: 'linear-gradient(135deg, #2b1055 0%, #7597de 100%)',
  ocean: 'linear-gradient(135deg, #0093e9 0%, #80d0c7 100%)',
  forest: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  mint: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
  lavender: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  peach: 'linear-gradient(135deg, #fbd3a4 0%, #f7a8a8 100%)',
  sand: 'linear-gradient(135deg, #f5e6c8 0%, #d6b98c 100%)',
  slate: 'linear-gradient(135deg, #485563 0%, #29323c 100%)',
};

// CSS background for a folder's cover, or null if it has none.
export function coverBackground(folder: Pick<Folder, 'id' | 'cover'>): string | null {
  if (!folder.cover) return null;
  if (folder.cover.startsWith('upload:')) {
    const token = folder.cover.slice('upload:'.length);
    return `center / cover no-repeat url("/api/folders/${folder.id}/cover?v=${encodeURIComponent(token)}")`;
  }
  return COVER_GRADIENTS[folder.cover.slice('gradient:'.length)] ?? null;
}
