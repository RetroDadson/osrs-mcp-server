import { describe, expect, it } from 'vitest';
import {
  validName,
  validateStringLength,
  validateOptionalStringLength,
  validateMemberPropLength,
} from './validators.js';

describe('validName', () => {
  it.each([
    'Zezima',
    'The Old Nite',
    'a',
    '1234567890123456', // exactly 16 chars
    'under_score',
    'hyphen-name',
    ' leading',
    'trailing ',
  ])('accepts %s', (name) => {
    expect(validName(name)).toBe(true);
  });

  it.each([
    ['', 'empty string'],
    ['12345678901234567', 'too long (17 chars)'],
    ['   ', 'all whitespace'],
    ['Bad@Name', 'contains @'],
    ['emoji😀', 'non-ASCII'],
    ['semi;colon', 'contains ;'],
    ['@SHARED', 'contains @'],
  ])('rejects %s (%s)', (name) => {
    expect(validName(name)).toBe(false);
  });
});

describe('validateStringLength', () => {
  it('accepts a value at or under the max', () => {
    expect(validateStringLength('task', 'abc', 3).ok).toBe(true);
    expect(validateStringLength('task', 'ab', 3).ok).toBe(true);
  });

  it('rejects a value over the max and includes the field name', () => {
    const result = validateStringLength('task', 'abcd', 3);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('task');
  });
});

describe('validateOptionalStringLength', () => {
  it('treats undefined and null as valid', () => {
    expect(validateOptionalStringLength('master', undefined, 50).ok).toBe(true);
    expect(validateOptionalStringLength('master', null, 50).ok).toBe(true);
  });

  it('validates a present value against the max', () => {
    expect(validateOptionalStringLength('master', 'a'.repeat(51), 50).ok).toBe(false);
    expect(validateOptionalStringLength('master', 'a'.repeat(50), 50).ok).toBe(true);
  });
});

describe('validateMemberPropLength', () => {
  it('treats undefined and null as valid (unset fields skip validation)', () => {
    expect(validateMemberPropLength('stats', undefined, 7, 7, 'flat').ok).toBe(true);
    expect(validateMemberPropLength('stats', null, 7, 7, 'flat').ok).toBe(true);
  });

  it('enforces the inclusive min/max element count', () => {
    expect(validateMemberPropLength('stats', new Array(7).fill(0), 7, 7, 'flat').ok).toBe(true);
    expect(validateMemberPropLength('stats', new Array(6).fill(0), 7, 7, 'flat').ok).toBe(false);
    expect(validateMemberPropLength('stats', new Array(8).fill(0), 7, 7, 'flat').ok).toBe(false);
  });

  it('enforces even length for item_pairs format', () => {
    expect(validateMemberPropLength('inventory', new Array(56).fill(0), 0, 56, 'item_pairs').ok).toBe(true);
    expect(validateMemberPropLength('inventory', new Array(55).fill(0), 0, 56, 'item_pairs').ok).toBe(false);
  });

  it('does not require evenness for flat format', () => {
    expect(validateMemberPropLength('quests', new Array(3).fill(0), 0, 250, 'flat').ok).toBe(true);
  });

  it('allows an empty array when min is 0', () => {
    expect(validateMemberPropLength('bank', [], 0, 3000, 'item_pairs').ok).toBe(true);
  });
});
