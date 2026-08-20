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

  it('stores and retrieves by tokenHash alone, carrying loginName through', () => {
    const cache = new AuthenticationCache();
    cache.insert('hashA', 'login-id-1', 'loginA');

    expect(cache.get('hashA')).toEqual({ loginId: 'login-id-1', loginName: 'loginA' });
    expect(cache.get('wrong-hash')).toBeUndefined();
  });

  it('returns undefined for a key that was never inserted', () => {
    const cache = new AuthenticationCache();
    expect(cache.get('nope')).toBeUndefined();
  });

  it('expires entries after 5 minutes', () => {
    const cache = new AuthenticationCache();
    cache.insert('hashA', 'login-id-1', 'loginA');

    vi.setSystemTime(4 * 60 * 1000);
    expect(cache.get('hashA')).toEqual({ loginId: 'login-id-1', loginName: 'loginA' });

    vi.setSystemTime(5 * 60 * 1000 + 1);
    expect(cache.get('hashA')).toBeUndefined();
  });

  it('sweeps expired entries opportunistically on insert, at most once per 60s', () => {
    const cache = new AuthenticationCache();
    cache.insert('hashA', 'id-1', 'loginA');

    vi.setSystemTime(6 * 60 * 1000); // well past TTL and past the 60s sweep interval
    cache.insert('hashB', 'id-2', 'loginB');

    // The sweep triggered by inserting hashB should have dropped the expired hashA entry.
    expect(cache.size).toBe(1);
  });

  it('stops caching new entries once at capacity, without evicting existing ones', () => {
    const cache = new AuthenticationCache();
    const MAX_ENTRIES = 10_000;

    for (let i = 0; i < MAX_ENTRIES; i++) {
      cache.insert(`hash${i}`, `id-${i}`, `login${i}`);
    }
    expect(cache.size).toBe(MAX_ENTRIES);

    cache.insert('one-too-many', 'id-overflow', 'overflow-login');
    expect(cache.size).toBe(MAX_ENTRIES);
    expect(cache.get('one-too-many')).toBeUndefined();
    expect(cache.get('hash0')).toEqual({ loginId: 'id-0', loginName: 'login0' });
  });
});
