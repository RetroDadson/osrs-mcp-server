const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 10_000;
const SWEEP_INTERVAL_MS = 60 * 1000;

interface CachedEntry {
  loginId: string;
  loginName: string;
  expiresAt: number;
}

export interface CachedLogin {
  loginId: string;
  loginName: string;
}

/**
 * In-process, single-instance auth cache keyed by tokenHash alone - never the raw token.
 * TTL-only eviction (5 min), with a 10,000-entry cap enforced opportunistically on insert (no
 * proactive sweep timer, no LRU eviction - once full, new inserts are just silently not cached
 * until the next sweep frees room). A revoked/rotated token can still authenticate via a stale
 * cache entry for up to 5 minutes - accepted, not fixed, matching the prior Rust cache exactly.
 */
export class AuthenticationCache {
  private readonly entries = new Map<string, CachedEntry>();
  private lastSweep = Date.now();

  get(tokenHash: string): CachedLogin | undefined {
    const entry = this.entries.get(tokenHash);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) return undefined;
    return { loginId: entry.loginId, loginName: entry.loginName };
  }

  insert(tokenHash: string, loginId: string, loginName: string): void {
    const now = Date.now();
    if (now - this.lastSweep >= SWEEP_INTERVAL_MS) {
      this.sweep(now);
    }

    if (this.entries.size >= MAX_ENTRIES) {
      return;
    }

    this.entries.set(tokenHash, { loginId, loginName, expiresAt: now + TTL_MS });
  }

  /** Drops a single entry immediately - used after a rename so the new name is visible right away, not after the TTL. */
  evict(tokenHash: string): void {
    this.entries.delete(tokenHash);
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
