import { describe, expect, it } from 'vitest';
import { tokenHash } from './token-hash.js';

describe('tokenHash', () => {
  it('is deterministic for the same inputs', () => {
    expect(tokenHash('tok', 'login', 'secret')).toBe(tokenHash('tok', 'login', 'secret'));
  });

  it('produces a 64-char lowercase hex digest (SHA-256)', () => {
    const hash = tokenHash('tok', 'login', 'secret');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when the token changes', () => {
    expect(tokenHash('tok1', 'login', 'secret')).not.toBe(tokenHash('tok2', 'login', 'secret'));
  });

  it('differs when the login name changes', () => {
    expect(tokenHash('tok', 'login1', 'secret')).not.toBe(tokenHash('tok', 'login2', 'secret'));
  });

  it('differs when the secret changes', () => {
    expect(tokenHash('tok', 'login', 'secret1')).not.toBe(tokenHash('tok', 'login', 'secret2'));
  });

  it('does not collide across the loginName/token boundary (NUL-separated, not naive concat)', () => {
    expect(tokenHash('c', 'ab', 'secret')).not.toBe(tokenHash('bc', 'a', 'secret'));
  });
});
