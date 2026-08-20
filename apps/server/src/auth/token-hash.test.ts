import { describe, expect, it } from 'vitest';
import { tokenHash } from './token-hash.js';

describe('tokenHash', () => {
  it('is deterministic for the same inputs', () => {
    expect(tokenHash('tok', 'secret')).toBe(tokenHash('tok', 'secret'));
  });

  it('produces a 64-char lowercase hex digest (SHA-256)', () => {
    const hash = tokenHash('tok', 'secret');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when the token changes', () => {
    expect(tokenHash('tok1', 'secret')).not.toBe(tokenHash('tok2', 'secret'));
  });

  it('differs when the secret changes', () => {
    expect(tokenHash('tok', 'secret1')).not.toBe(tokenHash('tok', 'secret2'));
  });
});
