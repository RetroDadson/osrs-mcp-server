import type { PendingUpdate } from './types.js';

export const INT32_MAX = 2147483647;

export function saturatingAddI32(a: number, b: number): number {
  return Math.min(a + b, INT32_MAX);
}

/**
 * Additively merges two flat `[itemId, qty, itemId, qty, ...]` deposit lists (item ids
 * accumulate across both, `i32`-saturating), filtering out `itemId === 0` and non-positive
 * quantities, sorted by item id for determinism. Returns `undefined` only when neither side
 * provided a deposits field at all.
 */
export function mergeDeposited(older: number[] | undefined, newer: number[] | undefined): number[] | undefined {
  if (older === undefined && newer === undefined) return undefined;

  const totals = new Map<number, number>();
  for (const pairs of [older, newer]) {
    if (!pairs) continue;
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      const itemId = pairs[i]!;
      const qty = pairs[i + 1]!;
      if (itemId === 0 || qty <= 0) continue;
      totals.set(itemId, saturatingAddI32(totals.get(itemId) ?? 0, qty));
    }
  }

  const sortedIds = Array.from(totals.keys()).sort((a, b) => a - b);
  const result: number[] = [];
  for (const id of sortedIds) {
    result.push(id, totals.get(id)!);
  }
  return result;
}

/**
 * Last-non-null-wins per field (a `newer` field left `undefined` never clobbers an existing
 * `older` value - this is what prevents lost updates across partial-update messages in the same
 * batch window). `deposited` is the one exception: additively merged via `mergeDeposited`.
 * `groupId`/`name` are always taken from `newer` (identity fields, always equal within one
 * dedup key anyway).
 */
export function mergeGroupMember(older: PendingUpdate, newer: PendingUpdate): PendingUpdate {
  return {
    groupId: newer.groupId,
    name: newer.name,
    stats: newer.stats ?? older.stats,
    coordinates: newer.coordinates ?? older.coordinates,
    skills: newer.skills ?? older.skills,
    quests: newer.quests ?? older.quests,
    inventory: newer.inventory ?? older.inventory,
    equipment: newer.equipment ?? older.equipment,
    bank: newer.bank ?? older.bank,
    sharedBank: newer.sharedBank ?? older.sharedBank,
    runePouch: newer.runePouch ?? older.runePouch,
    interacting: newer.interacting ?? older.interacting,
    seedVault: newer.seedVault ?? older.seedVault,
    deposited: mergeDeposited(older.deposited, newer.deposited),
    diaryVars: newer.diaryVars ?? older.diaryVars,
    collectionLogV2: newer.collectionLogV2 ?? older.collectionLogV2,
    potionStorage: newer.potionStorage ?? older.potionStorage,
    slayerTask: newer.slayerTask ?? older.slayerTask,
    combatAchievements: newer.combatAchievements ?? older.combatAchievements,
    farmingPatches: newer.farmingPatches ?? older.farmingPatches,
    lastUpdated: newer.lastUpdated ?? older.lastUpdated,
  };
}

/**
 * Merges same-`(groupId, name)` entries in received order, then sorts by `(groupId, name)` for
 * deterministic lock ordering across concurrent chunk processing. The dedup key is an exact
 * string match on `name` (not case-normalized) - the DB's `citext` comparison is what makes two
 * differently-cased names for the same member still resolve to one row at the SQL layer.
 */
export function deduplicateBatch(items: PendingUpdate[]): PendingUpdate[] {
  const merged = new Map<string, PendingUpdate>();
  for (const item of items) {
    const key = `${item.groupId}:${item.name}`;
    const existing = merged.get(key);
    merged.set(key, existing ? mergeGroupMember(existing, item) : item);
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId < b.groupId ? -1 : 1;
    if (a.name === b.name) return 0;
    return a.name < b.name ? -1 : 1;
  });
}

/**
 * Picks the newest `sharedBank` snapshot per group (ties -> last-in-buffer wins). Deliberately
 * computed from the RAW pre-dedup buffer, not the deduplicated one: `mergeGroupMember`
 * independently overwrites `sharedBank` and `lastUpdated`, so a later *partial* update (no
 * `sharedBank`, but a newer `lastUpdated`) could otherwise make a stale `sharedBank` value
 * incorrectly "win" over a genuinely newer one from a different member's message.
 */
export function coalesceSharedBankUpdates(members: readonly PendingUpdate[]): Map<string, number[]> {
  const best = new Map<string, { sharedBank: number[]; lastUpdated: string }>();

  for (const member of members) {
    if (member.sharedBank === undefined) continue;
    const lastUpdated = member.lastUpdated ?? '';
    const current = best.get(member.groupId);
    if (!current || lastUpdated >= current.lastUpdated) {
      best.set(member.groupId, { sharedBank: member.sharedBank, lastUpdated });
    }
  }

  const result = new Map<string, number[]>();
  for (const [groupId, entry] of best) {
    result.set(groupId, entry.sharedBank);
  }
  return result;
}

/** A deposits array is only actionable if non-empty and an even length (item id/quantity pairs). */
export function hasValidDeposits(deposited: number[] | undefined): deposited is number[] {
  return deposited !== undefined && deposited.length > 0 && deposited.length % 2 === 0;
}
