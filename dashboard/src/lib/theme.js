import { useEffect, useState } from 'react';

const STORAGE_KEY = 'psd.theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

const readStored = () => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
};

/** Explicit light/dark choice stamped on <html data-theme>; falls back to the OS setting. */
export function useTheme() {
  const [theme, setTheme] = useState(() => readStored() ?? (media().matches ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage unavailable */ }
  }, [theme]);
  return [theme, setTheme];
}

const TOKEN_NAMES = [
  'surface', 'ink', 'ink-2', 'muted', 'grid', 'axis',
  'series-1', 'series-2', 'series-3', 'series-4', 'series-5',
  'partner', 'mixed', 'rival', 'emphasis-muted',
  'owned-1', 'owned-2', 'neutral-1', 'neutral-2', 'neutral-3',
];

/**
 * SVG presentation attributes can't reliably take var(), so charts read the resolved
 * token values here. Re-reads whenever the theme changes.
 */
export function useChartTokens(theme) {
  const [tokens, setTokens] = useState(() => readTokens());
  useEffect(() => { setTokens(readTokens()); }, [theme]);
  return tokens;
}

function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(TOKEN_NAMES.map((n) => [n, cs.getPropertyValue(`--${n}`).trim()]));
}
