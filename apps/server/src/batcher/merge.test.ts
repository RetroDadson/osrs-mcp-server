import { describe, expect, it } from 'vitest';
import type { PendingUpdate } from './types.js';
import { deduplicateBatch, hasValidDeposits, mergeDeposited, mergeLoginUpdate } from './merge.js';

const BLANK_UPDATE: PendingUpdate = {
  loginId: '1',
  stats: undefined,
  skills: undefined,
  quests: undefined,
  inventory: undefined,
  equipment: undefined,
  bank: undefined,
  sharedBank: undefined,
  runePouch: undefined,
  quiver: undefined,
  interacting: undefined,
  seedVault: undefined,
  deposited: undefined,
  diaryVars: undefined,
  collectionLogV2: undefined,
  potionStorage: undefined,
  slayerTask: undefined,
  combatAchievements: undefined,
  farmingPatches: undefined,
  lastUpdated: undefined,
};

function loginUpdate(overrides: Partial<PendingUpdate>): PendingUpdate {
  return { ...BLANK_UPDATE, ...overrides };
}

describe('mergeDeposited', () => {
  it('returns undefined when neither side has deposits', () => {
    expect(mergeDeposited(undefined, undefined)).toBeUndefined();
  });

  it('returns the other side unchanged when only one side has deposits', () => {
    expect(mergeDeposited(undefined, [1, 5])).toEqual([1, 5]);
    expect(mergeDeposited([1, 5], undefined)).toEqual([1, 5]);
  });

  it('accumulates the same item id across both sides', () => {
    expect(mergeDeposited([1, 5], [1, 3])).toEqual([1, 8]);
  });

  it('merges distinct item ids, sorted by item id', () => {
    expect(mergeDeposited([5, 1], [2, 1])).toEqual([2, 1, 5, 1]);
  });

  it('filters out item id 0', () => {
    expect(mergeDeposited([0, 100], [1, 5])).toEqual([1, 5]);
  });

  it('filters out non-positive quantities', () => {
    expect(mergeDeposited([1, 0], [2, -5])).toEqual([]);
  });

  it('saturates at i32 max instead of overflowing', () => {
    expect(mergeDeposited([1, 2147483647], [1, 100])).toEqual([1, 2147483647]);
  });

  it('ignores a trailing unpaired item id', () => {
    expect(mergeDeposited([1, 5, 2], undefined)).toEqual([1, 5]);
  });
});

describe('mergeLoginUpdate', () => {
  it('overwrites a field when newer provides it', () => {
    const older = loginUpdate({ stats: [1, 1, 1] });
    const newer = loginUpdate({ stats: [2, 2, 2] });
    expect(mergeLoginUpdate(older, newer).stats).toEqual([2, 2, 2]);
  });

  it('keeps the older value when newer leaves the field undefined', () => {
    const older = loginUpdate({ stats: [1, 1, 1] });
    const newer = loginUpdate({ skills: [1, 2, 3] });
    expect(mergeLoginUpdate(older, newer).stats).toEqual([1, 1, 1]);
  });

  it('lets an explicit empty array from newer win (still "provided")', () => {
    const older = loginUpdate({ diaryVars: [1, 2, 3] });
    const newer = loginUpdate({ diaryVars: [] });
    expect(mergeLoginUpdate(older, newer).diaryVars).toEqual([]);
  });

  it('always takes loginId from newer', () => {
    const older = loginUpdate({ loginId: '1' });
    const newer = loginUpdate({ loginId: '1' });
    const result = mergeLoginUpdate(older, newer);
    expect(result.loginId).toBe('1');
  });

  it('merges deposited additively rather than overwriting', () => {
    const older = loginUpdate({ deposited: [1, 5] });
    const newer = loginUpdate({ deposited: [1, 3] });
    expect(mergeLoginUpdate(older, newer).deposited).toEqual([1, 8]);
  });

  it('merges shared_bank via the same last-non-null-wins rule as every other field', () => {
    const older = loginUpdate({ sharedBank: [1, 1] });
    const newer = loginUpdate({ sharedBank: undefined });
    expect(mergeLoginUpdate(older, newer).sharedBank).toEqual([1, 1]);

    const overwritten = loginUpdate({ sharedBank: [2, 2] });
    expect(mergeLoginUpdate(older, overwritten).sharedBank).toEqual([2, 2]);
  });

  it('merges every other snapshot field independently', () => {
    const older = loginUpdate({ skills: new Array(24).fill(1), interacting: undefined });
    const newer = loginUpdate({
      combatAchievements: [1, 2, 3, 4, 5, 6],
      slayerTask: { task: 'Gargoyles', amount_remaining: 5, initial_amount: 10, points: 1, task_streak: 1, wilderness_streak: 0 },
    });
    const result = mergeLoginUpdate(older, newer);
    expect(result.skills).toEqual(new Array(24).fill(1));
    expect(result.combatAchievements).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.slayerTask?.task).toBe('Gargoyles');
  });
});

describe('deduplicateBatch', () => {
  it('merges multiple updates for the same loginId in received order', () => {
    const items = [loginUpdate({ stats: [1, 1, 1] }), loginUpdate({ skills: [9, 9, 9] })];
    const result = deduplicateBatch(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.stats).toEqual([1, 1, 1]);
    expect(result[0]?.skills).toEqual([9, 9, 9]);
  });

  it('keeps different logins separate', () => {
    const items = [loginUpdate({ loginId: '1' }), loginUpdate({ loginId: '2' }), loginUpdate({ loginId: '3' })];
    expect(deduplicateBatch(items)).toHaveLength(3);
  });

  it('sorts the result by loginId for deterministic lock ordering', () => {
    const items = [loginUpdate({ loginId: '2' }), loginUpdate({ loginId: '10' }), loginUpdate({ loginId: '1' })];
    const result = deduplicateBatch(items);
    expect(result.map((u) => u.loginId)).toEqual(['1', '10', '2']);
  });

  it('handles an empty batch', () => {
    expect(deduplicateBatch([])).toEqual([]);
  });
});

describe('hasValidDeposits', () => {
  it('rejects undefined and empty arrays', () => {
    expect(hasValidDeposits(undefined)).toBe(false);
    expect(hasValidDeposits([])).toBe(false);
  });

  it('rejects an odd-length array', () => {
    expect(hasValidDeposits([1, 5, 2])).toBe(false);
  });

  it('accepts a non-empty even-length array', () => {
    expect(hasValidDeposits([1, 5])).toBe(true);
  });
});
