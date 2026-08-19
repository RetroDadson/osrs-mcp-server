import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredLogin,
  getLayoutDirection,
  getStoredLogin,
  getTheme,
  setLayoutDirection,
  setTheme,
  storeLogin,
} from './storage.js';

describe('login storage', () => {
  it('stores and retrieves loginName/token', () => {
    storeLogin('mylogin', 'mytoken');
    expect(getStoredLogin()).toEqual({ loginName: 'mylogin', token: 'mytoken' });
  });

  it('returns nulls when nothing is stored', () => {
    expect(getStoredLogin()).toEqual({ loginName: null, token: null });
  });

  it('clears stored credentials', () => {
    storeLogin('mylogin', 'mytoken');
    clearStoredLogin();
    expect(getStoredLogin()).toEqual({ loginName: null, token: null });
  });
});

describe('theme', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark-mode');
  });

  it('defaults to the system preference when nothing is stored', () => {
    const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMediaMock);
    expect(getTheme()).toBe('dark');
    vi.unstubAllGlobals();
  });

  it('reads a previously stored theme over the system preference', () => {
    setTheme('light');
    expect(getTheme()).toBe('light');
  });

  it('toggles the dark-mode class on the document element', () => {
    setTheme('dark');
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    setTheme('light');
    expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
  });
});

describe('layout direction', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to row', () => {
    expect(getLayoutDirection()).toBe('row');
  });

  it('reads back a stored row-reverse value', () => {
    setLayoutDirection('row-reverse');
    expect(getLayoutDirection()).toBe('row-reverse');
  });
});
