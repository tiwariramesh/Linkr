import type { ColorName } from './types';

// Full class names (not built from parts) so Tailwind can see them.
export const COLORS: Record<ColorName, { label: string; dot: string; text: string; soft: string; ring: string }> = {
  gray: { label: 'Gray', dot: 'bg-zinc-400', text: 'text-zinc-500', soft: 'bg-zinc-500/10', ring: 'ring-zinc-400' },
  red: { label: 'Red', dot: 'bg-red-500', text: 'text-red-500', soft: 'bg-red-500/10', ring: 'ring-red-500' },
  orange: {
    label: 'Orange',
    dot: 'bg-orange-500',
    text: 'text-orange-500',
    soft: 'bg-orange-500/10',
    ring: 'ring-orange-500',
  },
  amber: {
    label: 'Amber',
    dot: 'bg-amber-400',
    text: 'text-amber-500',
    soft: 'bg-amber-400/15',
    ring: 'ring-amber-400',
  },
  green: {
    label: 'Green',
    dot: 'bg-emerald-500',
    text: 'text-emerald-500',
    soft: 'bg-emerald-500/10',
    ring: 'ring-emerald-500',
  },
  teal: { label: 'Teal', dot: 'bg-teal-500', text: 'text-teal-500', soft: 'bg-teal-500/10', ring: 'ring-teal-500' },
  blue: { label: 'Blue', dot: 'bg-blue-500', text: 'text-blue-500', soft: 'bg-blue-500/10', ring: 'ring-blue-500' },
  indigo: {
    label: 'Indigo',
    dot: 'bg-indigo-500',
    text: 'text-indigo-500',
    soft: 'bg-indigo-500/10',
    ring: 'ring-indigo-500',
  },
  purple: {
    label: 'Purple',
    dot: 'bg-purple-500',
    text: 'text-purple-500',
    soft: 'bg-purple-500/10',
    ring: 'ring-purple-500',
  },
  pink: { label: 'Pink', dot: 'bg-pink-500', text: 'text-pink-500', soft: 'bg-pink-500/10', ring: 'ring-pink-500' },
};

export const COLOR_NAMES = Object.keys(COLORS) as ColorName[];

// A small, practical set for folders: subjects, formats and states.
export const FOLDER_ICONS = [
  '📁',
  '📚',
  '📖',
  '📝',
  '🎓',
  '🧑‍🏫',
  '🗓️',
  '⏱️',
  '🎯',
  '💡',
  '🧪',
  '🧠',
  '💻',
  '🤖',
  '📊',
  '📈',
  '🧮',
  '🌍',
  '🏛️',
  '⚖️',
  '🎨',
  '🎬',
  '🎧',
  '📷',
  '🗂️',
  '📌',
  '⭐',
  '🔥',
  '✅',
  '🚀',
];
