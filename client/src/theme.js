import { useEffect, useState } from 'react';

// The theme is stored in a cookie (not localStorage) so the server-rendered paste page can use it too.
const readSaved = () => document.cookie.match(/(?:^|;\s*)theme=(light|dark)/)?.[1] ?? null;
const systemTheme = () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function useTheme() {
  const [theme, setTheme] = useState(() => readSaved() ?? systemTheme());

  // Follow OS changes until the user picks a theme explicitly.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => !readSaved() && setTheme(systemTheme());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setTheme(next);
  };

  return [theme, toggle];
}
