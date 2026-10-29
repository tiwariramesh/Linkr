import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ItemType, LayoutType } from '@/lib/types.ts';
import { VisibilityState } from '@tanstack/react-table';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const colorMap = {
  gray: 'bg-gray-600',
  green: 'bg-green-600',
  red: 'bg-red-600',
  yellow: 'bg-yellow-600',
  aqua: 'bg-blue-600',
  white: 'bg-neutral-300',
  black: 'bg-neutral-950',
};

export const getColorClass = (color: string | undefined) => {
  return colorMap[color as keyof typeof colorMap] || colorMap.gray;
};

export const normalizeQuery = (val) => {
  return val
    .trim()
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '')
    .trim();
};

export const getSavedLayoutPreference = (): LayoutType => {
  return (localStorage.getItem('layout') as LayoutType) || 'list';
};

export const saveLayoutPreference = (value: LayoutType): void => {
  try {
    localStorage.setItem('layout', value);
  } catch {
    // Ignore storage errors - failing silently is acceptable for preferences
  }
};

export const getSavedLayoutColumnVisibilityPreference = (
  layout: LayoutType
): Partial<Record<keyof ItemType, boolean>> => {
  const defaultPref = {
    updated_at: false,
  };
  try {
    const stored = localStorage.getItem(`column-visibility-${layout}`);
    return stored ? JSON.parse(stored) : defaultPref;
  } catch {
    return defaultPref;
  }
};

export const saveLayoutColumnVisibilityPreference = (layout: LayoutType, columnVisibility: VisibilityState): void => {
  try {
    localStorage.setItem(`column-visibility-${layout}`, JSON.stringify(columnVisibility));
  } catch {
    // Ignore storage errors - failing silently is acceptable for preferences
  }
};

export const safeDecodeURIComponent = (encodedURI: string): string => {
  try {
    return encodedURI ? decodeURIComponent(encodedURI) : '';
  } catch {
    return encodedURI || '';
  }
};

export const safeDecodeURI = (encodedURI: string): string => {
  try {
    return encodedURI ? decodeURI(encodedURI) : '';
  } catch {
    return encodedURI || '';
  }
};

// Timestamps arrive as UTC ISO strings; show them in the viewer's local time.
export const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
