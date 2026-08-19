import { describe, expect, it } from 'vitest';
import type { PendingUpdate } from './types.js';
import { coalesceSharedBankUpdates, deduplicateBatch, hasValidDeposits, mergeDeposited, mergeMember } from './merge.js';

const BLANK_MEMBER: PendingUpdate = {
  loginId: '1',
  name: 'Zezima',
  stats: undefined,
  coordinates: undefined,
  skills: undefined,
  quests: undefined,
  inventory: undefined,
  equipment: undefined,
  bank: undefined,
  sharedBank: undefined,
  runePouch: undefined,
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

function member(overrides: Partial<PendingUpdate>): PendingUpdate {
  return { ...BLANK_MEMBER, ...overrides };
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

describe('mergeMember', () => {
  it('overwrites a field when newer provides it', () => {
    const older = member({ stats: [1, 1, 1] });
    const newer = member({ stats: [2, 2, 2] });
    expect(mergeMember(older, newer).stats).toEqual([2, 2, 2]);
  });

  it('keeps the older value when newer leaves the field undefined', () => {
    const older = member({ stats: [1, 1, 1] });
    const newer = member({ coordinates: [1, 2, 3] });
    expect(mergeMember(older, newer).stats).toEqual([1, 1, 1]);
  });

  it('lets an explicit empty array from newer win (still "provided")', () => {
    const older = member({ diaryVars: [1, 2, 3] });
    const newer = member({ diaryVars: [] });
    expect(mergeMember(older, newer).diaryVars).toEqual([]);
  });

  it('always takes name/loginId from newer', () => {
    const older = member({ loginId: '1', name: 'Old' });
    const newer = member({ loginId: '1', name: 'New' });
    const result = mergeMember(older, newer);
    expect(result.name).toBe('New');
  });

  it('merges deposited additively rather than overwriting', () => {
    const older = member({ deposited: [1, 5] });
    const newer = member({ deposited: [1, 3] });
    expect(mergeMember(older, newer).deposited).toEqual([1, 8]);
  });

  it('merges every other snapshot field independently', () => {
    const older = member({ skills: new Array(24).fill(1), interacting: undefined });
    const newer = member({
      combatAchievements: [1, 2, 3, 4, 5, 6],
      slayerTask: { task: 'Gargoyles', amount_remaining: 5, initial_amount: 10, points: 1, task_streak: 1, wilderness_streak: 0 },
    });
    const result = mergeMember(older, newer);
    expect(result.skills).toEqual(new Array(24).fill(1));
    expect(result.combatAchievements).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.slayerTask?.task).toBe('Gargoyles');
  });
});

describe('deduplicateBatch', () => {
  it('merges multiple updates for the same (loginId, name) in received order', () => {
    const items = [member({ stats: [1, 1, 1] }), member({ coordinates: [9, 9, 9] })];
    const result = deduplicateBatch(items);
    expect(result).toHaveLength(1);
    expect(result[0]?.stats).toEqual([1, 1, 1]);
    expect(result[0]?.coordinates).toEqual([9, 9, 9]);
  });

  it('keeps different members and different logins separate', () => {
    const items = [member({ name: 'Alice' }), member({ name: 'Bob' }), member({ loginId: '2', name: 'Alice' })];
    expect(deduplicateBatch(items)).toHaveLength(3);
  });

  it('sorts the result by (loginId, name) for deterministic lock ordering', () => {
    const items = [member({ loginId: '2', name: 'Bob' }), member({ loginId: '1', name: 'Zed' }), member({ loginId: '1', name: 'Alice' })];
    const result = deduplicateBatch(items);
    expect(result.map((m) => `${m.loginId}:${m.name}`)).toEqual(['1:Alice', '1:Zed', '2:Bob']);
  });

  it('handles an empty batch', () => {
    expect(deduplicateBatch([])).toEqual([]);
  });
});

describe('coalesceSharedBankUpdates', () => {
  it('picks the entry with the latest lastUpdated per login', () => {
    const members = [
      member({ name: 'A', sharedBank: [1, 1], lastUpdated: '2026-01-01T00:00:00.000Z' }),
      member({ name: 'B', sharedBank: [2, 2], lastUpdated: '2026-01-02T00:00:00.000Z' }),
    ];
    const result = coalesceSharedBankUpdates(members);
    expect(result.get('1')).toEqual([2, 2]);
  });

  it('ignores members that did not report a shared bank', () => {
    const members = [member({ name: 'A' }), member({ name: 'B', sharedBank: [3, 3] })];
    expect(coalesceSharedBankUpdates(members).get('1')).toEqual([3, 3]);
  });

  it('ties break to the later entry in the buffer', () => {
    const members = [
      member({ name: 'A', sharedBank: [1, 1], lastUpdated: '2026-01-01T00:00:00.000Z' }),
      member({ name: 'B', sharedBank: [2, 2], lastUpdated: '2026-01-01T00:00:00.000Z' }),
    ];
    expect(coalesceSharedBankUpdates(members).get('1')).toEqual([2, 2]);
  });

  it('is computed from the raw buffer, not deduplicated - a later partial update with a newer lastUpdated but no sharedBank must not win', () => {
    const rawBuffer = [
      member({ name: 'A', sharedBank: [1, 1], lastUpdated: '2026-01-01T00:00:00.000Z' }),
      member({ name: 'A', sharedBank: undefined, lastUpdated: '2026-01-02T00:00:00.000Z' }),
    ];
    // If this were computed post-merge, the merged record would show lastUpdated=Jan 2 but
    // sharedBank still [1,1] (carried over) - correctly attributed to the Jan-1 snapshot.
    // Coalescing from the raw buffer avoids ever attaching the newer timestamp to stale data.
    expect(coalesceSharedBankUpdates(rawBuffer).get('1')).toEqual([1, 1]);
  });

  it('returns an empty map when no member reports a shared bank', () => {
    expect(coalesceSharedBankUpdates([member({})]).size).toBe(0);
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
