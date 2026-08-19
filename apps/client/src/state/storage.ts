const GROUP_NAME_KEY = 'groupName';
const GROUP_TOKEN_KEY = 'groupToken';
const THEME_KEY = 'theme';
const LAYOUT_DIRECTION_KEY = 'layout-direction';

export interface StoredGroup {
  groupName: string | null;
  groupToken: string | null;
}

export function storeGroup(groupName: string, groupToken: string): void {
  localStorage.setItem(GROUP_NAME_KEY, groupName);
  localStorage.setItem(GROUP_TOKEN_KEY, groupToken);
}

export function getStoredGroup(): StoredGroup {
  return {
    groupName: localStorage.getItem(GROUP_NAME_KEY),
    groupToken: localStorage.getItem(GROUP_TOKEN_KEY),
  };
}

export function clearStoredGroup(): void {
  localStorage.removeItem(GROUP_NAME_KEY);
  localStorage.removeItem(GROUP_TOKEN_KEY);
}

export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return prefersDark ? 'dark' : 'light';
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.classList.toggle('dark-mode', theme === 'dark');
}

export type LayoutDirection = 'row' | 'row-reverse';

export function getLayoutDirection(): LayoutDirection {
  return localStorage.getItem(LAYOUT_DIRECTION_KEY) === 'row-reverse' ? 'row-reverse' : 'row';
}

export function setLayoutDirection(direction: LayoutDirection): void {
  localStorage.setItem(LAYOUT_DIRECTION_KEY, direction);
}
