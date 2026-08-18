import { describe, expect, it } from 'vitest';
import { tokenHash } from './token-hash.js';

describe('tokenHash', () => {
  it('is deterministic for the same inputs', () => {
    expect(tokenHash('tok', 'group', 'secret')).toBe(tokenHash('tok', 'group', 'secret'));
  });

  it('produces a 64-char lowercase hex digest (SHA-256)', () => {
    const hash = tokenHash('tok', 'group', 'secret');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs when the token changes', () => {
    expect(tokenHash('tok1', 'group', 'secret')).not.toBe(tokenHash('tok2', 'group', 'secret'));
  });

  it('differs when the group name changes', () => {
    expect(tokenHash('tok', 'group1', 'secret')).not.toBe(tokenHash('tok', 'group2', 'secret'));
  });

  it('differs when the secret changes', () => {
    expect(tokenHash('tok', 'group', 'secret1')).not.toBe(tokenHash('tok', 'group', 'secret2'));
  });

  it('does not collide across the groupName/token boundary (NUL-separated, not naive concat)', () => {
    expect(tokenHash('c', 'ab', 'secret')).not.toBe(tokenHash('bc', 'a', 'secret'));
  });
});
