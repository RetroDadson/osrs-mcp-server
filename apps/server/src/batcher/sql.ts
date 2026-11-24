import { sql, type Kysely } from 'kysely';
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
    ${update.loginId}::bigint,
    ${update.stats ?? null}::int4[],
    ${update.skills ?? null}::int4[],
    ${bufferParam(update.quests)}::bytea,
    ${update.inventory ?? null}::int4[],
    ${update.equipment ?? null}::int4[],
    ${update.bank ?? null}::int4[],
    ${update.sharedBank ?? null}::int4[],
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
 * a DB-level safety net on top of `mergeLoginUpdate`'s app-level null-never-clobbers logic - a
 * NULL param never overwrites existing data even if dedup were bypassed. Every column is cast to
 * a known type up front, avoiding Postgres's "could not determine data type of parameter" error
 * on a chunk that's entirely one column.
 */
export async function executeBulkUpdate(db: Kysely<Database>, chunk: readonly PendingUpdate[]): Promise<void> {
  if (chunk.length === 0) return;

  const valuesList = sql.join(
    chunk.map((update) => rowTuple(update)),
    sql`, `,
  );

  await sql`
    UPDATE osrsmcp.logins AS a SET
      stats = COALESCE(b.stats, a.stats),
      skills = COALESCE(b.skills, a.skills),
      quests = COALESCE(b.quests, a.quests),
      inventory = COALESCE(b.inventory, a.inventory),
      equipment = COALESCE(b.equipment, a.equipment),
      bank = COALESCE(b.bank, a.bank),
      shared_bank = COALESCE(b.shared_bank, a.shared_bank),
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
      login_id, stats, skills, quests, inventory,
      equipment, bank, shared_bank, rune_pouch, interacting, seed_vault, diary_vars, collection_log,
      potion_storage, slayer_task, combat_achievements, farming_patches
    )
    WHERE a.login_id = b.login_id
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
 * For every chunk login with a valid `deposited` list: locks that login's row, merges the
 * deposit into its current `bank`, and writes it back. Not idempotent on retry (unlike the bulk
 * UPDATE) - re-applying the same deposit message twice would double it.
 */
export async function processBankSideEffects(db: Kysely<Database>, chunk: readonly PendingUpdate[]): Promise<void> {
  const withDeposits = chunk.filter((update) => hasValidDeposits(update.deposited));
  if (withDeposits.length === 0) return;

  await db.transaction().execute(async (trx) => {
    for (const update of withDeposits) {
      const login = await trx.selectFrom('logins').select('bank').where('login_id', '=', update.loginId).forUpdate().executeTakeFirst();

      if (!login) continue;

      const mergedBank = mergeBankWithDeposits(login.bank ?? [], update.deposited!);
      await trx
        .updateTable('logins')
        .set({ bank: mergedBank, bank_last_update: new Date() })
        .where('login_id', '=', update.loginId)
        .execute();
    }
  });
}
