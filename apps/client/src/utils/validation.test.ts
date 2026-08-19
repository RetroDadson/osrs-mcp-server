import { describe, expect, it } from 'vitest';
import { validateOsrsName } from './validation.js';

describe('validateOsrsName', () => {
  it('returns null for a valid name', () => {
    expect(validateOsrsName('Zezima')).toBeNull();
  });

  it('returns a message for an empty name', () => {
    expect(validateOsrsName('')).not.toBeNull();
  });

  it('returns a message for a name with invalid characters', () => {
    expect(validateOsrsName('Bad@Name')).not.toBeNull();
  });

  it('returns a message for a name over 16 characters', () => {
    expect(validateOsrsName('a'.repeat(17))).not.toBeNull();
  });
});
