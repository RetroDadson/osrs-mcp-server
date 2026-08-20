import { beforeEach, describe, expect, it } from 'vitest';
import { clearStoredLogin, getLayoutDirection, getStoredLogin, setLayoutDirection, storeLogin } from './storage.js';

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
