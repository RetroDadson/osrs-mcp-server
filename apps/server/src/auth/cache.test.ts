import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthenticationCache } from './cache.js';

describe('AuthenticationCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves by the exact (loginName, tokenHash) key', () => {
    const cache = new AuthenticationCache();
    cache.insert('loginA', 'hashA', 'login-id-1');

    expect(cache.get('loginA', 'hashA')).toBe('login-id-1');
    expect(cache.get('loginA', 'wrong-hash')).toBeUndefined();
    expect(cache.get('loginB', 'hashA')).toBeUndefined();
  });

  it('returns undefined for a key that was never inserted', () => {
    const cache = new AuthenticationCache();
    expect(cache.get('nope', 'nope')).toBeUndefined();
  });

  it('expires entries after 5 minutes', () => {
    const cache = new AuthenticationCache();
    cache.insert('loginA', 'hashA', 'login-id-1');

    vi.setSystemTime(4 * 60 * 1000);
    expect(cache.get('loginA', 'hashA')).toBe('login-id-1');

    vi.setSystemTime(5 * 60 * 1000 + 1);
    expect(cache.get('loginA', 'hashA')).toBeUndefined();
  });

  it('sweeps expired entries opportunistically on insert, at most once per 60s', () => {
    const cache = new AuthenticationCache();
    cache.insert('loginA', 'hashA', 'id-1');

    vi.setSystemTime(6 * 60 * 1000); // well past TTL and past the 60s sweep interval
    cache.insert('loginB', 'hashB', 'id-2');

    // The sweep triggered by inserting loginB should have dropped the expired loginA entry.
    expect(cache.size).toBe(1);
  });

  it('stops caching new entries once at capacity, without evicting existing ones', () => {
    const cache = new AuthenticationCache();
    const MAX_ENTRIES = 10_000;

    for (let i = 0; i < MAX_ENTRIES; i++) {
      cache.insert(`login${i}`, 'hash', `id-${i}`);
    }
    expect(cache.size).toBe(MAX_ENTRIES);

    cache.insert('one-too-many', 'hash', 'id-overflow');
    expect(cache.size).toBe(MAX_ENTRIES);
    expect(cache.get('one-too-many', 'hash')).toBeUndefined();
    expect(cache.get('login0', 'hash')).toBe('id-0');
  });
});
