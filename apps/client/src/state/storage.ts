const LOGIN_NAME_KEY = 'loginName';
const TOKEN_KEY = 'token';
const THEME_KEY = 'theme';
const LAYOUT_DIRECTION_KEY = 'layout-direction';

export interface StoredLogin {
  loginName: string | null;
  token: string | null;
}

export function storeLogin(loginName: string, token: string): void {
  localStorage.setItem(LOGIN_NAME_KEY, loginName);
  localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredLogin(): StoredLogin {
  return {
    loginName: localStorage.getItem(LOGIN_NAME_KEY),
    token: localStorage.getItem(TOKEN_KEY),
  };
}

export function clearStoredLogin(): void {
  localStorage.removeItem(LOGIN_NAME_KEY);
  localStorage.removeItem(TOKEN_KEY);
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
