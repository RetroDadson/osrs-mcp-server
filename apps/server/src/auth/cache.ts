const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 10_000;
const SWEEP_INTERVAL_MS = 60 * 1000;

interface CachedEntry {
  loginId: string;
  expiresAt: number;
}

function cacheKey(loginName: string, tokenHash: string): string {
  return `${loginName}:${tokenHash}`;
}

/**
 * In-process, single-instance auth cache keyed by (loginName, tokenHash) - never the raw token.
 * TTL-only eviction (5 min), with a 10,000-entry cap enforced opportunistically on insert (no
 * proactive sweep timer, no LRU eviction - once full, new inserts are just silently not cached
 * until the next sweep frees room). A revoked/rotated token can still authenticate via a stale
 * cache entry for up to 5 minutes - accepted, not fixed, matching the prior Rust cache exactly.
 */
export class AuthenticationCache {
  private readonly entries = new Map<string, CachedEntry>();
  private lastSweep = Date.now();

  get(loginName: string, tokenHash: string): string | undefined {
    const entry = this.entries.get(cacheKey(loginName, tokenHash));
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) return undefined;
    return entry.loginId;
  }

  insert(loginName: string, tokenHash: string, loginId: string): void {
    const now = Date.now();
    if (now - this.lastSweep >= SWEEP_INTERVAL_MS) {
      this.sweep(now);
    }

    if (this.entries.size >= MAX_ENTRIES) {
      return;
    }

    this.entries.set(cacheKey(loginName, tokenHash), { loginId, expiresAt: now + TTL_MS });
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
    this.lastSweep = now;
  }

  get size(): number {
    return this.entries.size;
  }
}
