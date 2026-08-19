import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredGroup,
  getLayoutDirection,
  getStoredGroup,
  getTheme,
  setLayoutDirection,
  setTheme,
  storeGroup,
} from './storage.js';

describe('group storage', () => {
  it('stores and retrieves groupName/groupToken', () => {
    storeGroup('mygroup', 'mytoken');
    expect(getStoredGroup()).toEqual({ groupName: 'mygroup', groupToken: 'mytoken' });
  });

  it('returns nulls when nothing is stored', () => {
    expect(getStoredGroup()).toEqual({ groupName: null, groupToken: null });
  });

  it('clears stored credentials', () => {
    storeGroup('mygroup', 'mytoken');
    clearStoredGroup();
    expect(getStoredGroup()).toEqual({ groupName: null, groupToken: null });
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
