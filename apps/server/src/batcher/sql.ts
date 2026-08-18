import { sql, type Kysely } from 'kysely';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import type { Database } from '../db/types.js';
import { hasValidDeposits, saturatingAddI32 } from './merge.js';
import type { PendingUpdate } from './types.js';

function jsonbParam(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function bufferParam(value: number[] | undefined): Buffer | null {
  return value === undefined ? null : Buffer.from(value);
}

function rowTuple(update: PendingUpdate) {
  return sql`(
    ${update.groupId}::bigint,
    ${update.name}::citext,
    ${update.stats ?? null}::int4[],
    ${update.coordinates ?? null}::int4[],
    ${update.skills ?? null}::int4[],
    ${bufferParam(update.quests)}::bytea,
    ${update.inventory ?? null}::int4[],
    ${update.equipment ?? null}::int4[],
    ${update.bank ?? null}::int4[],
    ${update.runePouch ?? null}::int4[],
    ${jsonbParam(update.interacting)}::jsonb,
    ${update.seedVault ?? null}::int4[],
    ${update.diaryVars ?? null}::int4[],
    ${update.collectionLogV2 ?? null}::int4[],
    ${update.potionStorage ?? null}::int4[],
    ${jsonbParam(update.slayerTask)}::jsonb,
    ${update.combatAchievements ?? null}::int4[],
    ${jsonbParam(update.farmingPatches)}::jsonb
  )`;
}

/**
 * One wide `UPDATE ... FROM (VALUES ...)` per chunk (<=CHUNK_SIZE rows). `COALESCE(b.x, a.x)` is
 * a DB-level safety net on top of `mergeGroupMember`'s app-level null-never-clobbers logic - a
 * NULL param never overwrites existing data even if dedup were bypassed. Non-matching
 * `(group_id, member_name)` rows are silent no-ops (matches every column being cast to a known
 * type up front, so a chunk that's entirely one column avoids Postgres's "could not determine
 * data type of parameter" error on all-NULL columns).
 */
export async function executeBulkUpdate(db: Kysely<Database>, chunk: readonly PendingUpdate[]): Promise<void> {
  if (chunk.length === 0) return;

  const valuesList = sql.join(
    chunk.map((update) => rowTuple(update)),
    sql`, `,
  );

  await sql`
    UPDATE osrsmcp.members AS a SET
      stats = COALESCE(b.stats, a.stats),
      coordinates = COALESCE(b.coordinates, a.coordinates),
      skills = COALESCE(b.skills, a.skills),
      quests = COALESCE(b.quests, a.quests),
      inventory = COALESCE(b.inventory, a.inventory),
      equipment = COALESCE(b.equipment, a.equipment),
      bank = COALESCE(b.bank, a.bank),
      rune_pouch = COALESCE(b.rune_pouch, a.rune_pouch),
      interacting = COALESCE(b.interacting, a.interacting),
      seed_vault = COALESCE(b.seed_vault, a.seed_vault),
      diary_vars = COALESCE(b.diary_vars, a.diary_vars),
      collection_log = COALESCE(b.collection_log, a.collection_log),
      potion_storage = COALESCE(b.potion_storage, a.potion_storage),
      slayer_task = COALESCE(b.slayer_task, a.slayer_task),
      combat_achievements = COALESCE(b.combat_achievements, a.combat_achievements),
      farming_patches = COALESCE(b.farming_patches, a.farming_patches)
    FROM (VALUES ${valuesList}) AS b(
      group_id, member_name, stats, coordinates, skills, quests, inventory,
      equipment, bank, rune_pouch, interacting, seed_vault, diary_vars, collection_log,
      potion_storage, slayer_task, combat_achievements, farming_patches
    )
    WHERE a.group_id = b.group_id AND a.member_name = b.member_name
  `.execute(db);
}

/** Merges a flat `[itemId, qty, ...]` deposit list into an existing flat bank array. */
export function mergeBankWithDeposits(currentBank: readonly number[], deposits: readonly number[]): number[] {
  const totals = new Map<number, number>();
  for (let i = 0; i + 1 < currentBank.length; i += 2) {
    totals.set(currentBank[i]!, currentBank[i + 1]!);
  }
  for (let i = 0; i + 1 < deposits.length; i += 2) {
    const itemId = deposits[i]!;
    const qty = deposits[i + 1]!;
    if (itemId === 0 || qty <= 0) continue;
    totals.set(itemId, saturatingAddI32(totals.get(itemId) ?? 0, qty));
  }

  const sortedIds = Array.from(totals.keys()).sort((a, b) => a - b);
  const result: number[] = [];
  for (const id of sortedIds) {
    result.push(id, totals.get(id)!);
  }
  return result;
}

/**
 * For every chunk member with a valid `deposited` list: locks that member's row, merges the
 * deposit into their current `bank`, and writes it back. Not idempotent on retry (unlike the
 * bulk UPDATE and shared-bank pass) - re-applying the same deposit message twice would double it.
 */
export async function processBankSideEffects(db: Kysely<Database>, chunk: readonly PendingUpdate[]): Promise<void> {
  const withDeposits = chunk.filter((update) => hasValidDeposits(update.deposited));
  if (withDeposits.length === 0) return;

  await db.transaction().execute(async (trx) => {
    for (const update of withDeposits) {
      const member = await trx
        .selectFrom('members')
        .select(['member_id', 'bank'])
        .where('group_id', '=', update.groupId)
        .where('member_name', '=', update.name)
        .forUpdate()
        .executeTakeFirst();

      if (!member) continue; // matches the bulk UPDATE's "non-member update is a silent no-op"

      const mergedBank = mergeBankWithDeposits(member.bank ?? [], update.deposited!);
      await trx
        .updateTable('members')
        .set({ bank: mergedBank, bank_last_update: new Date() })
        .where('member_id', '=', member.member_id)
        .execute();
    }
  });
}

/** One `UPDATE` per group's coalesced shared-bank snapshot, all in one transaction. Idempotent on retry. */
export async function processSharedBankUpdates(db: Kysely<Database>, updates: ReadonlyMap<string, number[]>): Promise<void> {
  if (updates.size === 0) return;

  await db.transaction().execute(async (trx) => {
    for (const [groupId, bank] of updates) {
      await trx
        .updateTable('members')
        .set({ bank, bank_last_update: new Date() })
        .where('group_id', '=', groupId)
        .where('member_name', '=', SHARED_MEMBER)
        .execute();
    }
  });
}
