import { create } from 'zustand';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'linkr-theme'; // also read by the inline script in index.html

const media = window.matchMedia('(prefers-color-scheme: dark)');

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (theme: Theme) => (theme === 'system' ? (media.matches ? 'dark' : 'light') : theme);

export const useTheme = create<{ theme: Theme; resolved: 'light' | 'dark' }>(() => {
  const theme = readTheme();
  return { theme, resolved: resolve(theme) };
});

function apply(theme: Theme) {
  const resolved = resolve(theme);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  useTheme.setState({ theme, resolved });
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: the choice lasts for this visit
  }
  apply(theme);
}

media.addEventListener('change', () => apply(useTheme.getState().theme));
