export type AppTheme = 'dark' | 'light';

const STORAGE_KEY = 'runway_theme';

export function getStoredTheme(): AppTheme {
  return (localStorage.getItem(STORAGE_KEY) ?? 'dark') === 'dark' ? 'dark' : 'light';
}

export function setStoredTheme(theme: AppTheme) {
  localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Applies the active theme to <html>. `dark` drives the runway palette tokens
 * (globals.css), while `runwayDark`/`runwayLight` drive HeroUI's component
 * theme. When `smooth` is set, a transient `.theme-transition` class animates
 * the flip.
 */
export function applyTheme(theme: AppTheme, smooth = false) {
  const root = document.documentElement;
  if (smooth) root.classList.add('theme-transition');
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('runwayDark', theme === 'dark');
  root.classList.toggle('runwayLight', theme === 'light');
  if (smooth) {
    window.setTimeout(() => root.classList.remove('theme-transition'), 420);
  }
}
