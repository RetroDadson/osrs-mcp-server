import type { Kysely } from 'kysely';
import type { Database } from './types.js';

export interface SlayerTaskCompletionInput {
  task: string;
  master: string | null;
  amountCompleted: number;
  outcome: string;
}

export async function recordSlayerTaskCompletion(
  db: Kysely<Database>,
  memberId: string,
  input: SlayerTaskCompletionInput,
): Promise<void> {
  await db
    .insertInto('slayer_task_history')
    .values({
      member_id: memberId,
      task: input.task,
      master: input.master,
      amount_completed: input.amountCompleted,
      outcome: input.outcome,
    })
    .execute();
}

export async function recordClueCompletion(db: Kysely<Database>, memberId: string, tier: string): Promise<void> {
  await db.insertInto('clue_completions').values({ member_id: memberId, tier }).execute();
}

export interface DeathInput {
  worldX: number | null;
  worldY: number | null;
  plane: number | null;
  killer: string | null;
}

export async function recordDeath(db: Kysely<Database>, memberId: string, input: DeathInput): Promise<void> {
  await db
    .insertInto('deaths')
    .values({ member_id: memberId, world_x: input.worldX, world_y: input.worldY, plane: input.plane, killer: input.killer })
    .execute();
}

export async function upsertHiscoreActivity(
  db: Kysely<Database>,
  memberId: string,
  activityName: string,
  score: number,
): Promise<void> {
  await db
    .insertInto('hiscore_activities')
    .values({ member_id: memberId, activity_name: activityName, score })
    .onConflict((oc) => oc.columns(['member_id', 'activity_name']).doUpdateSet({ score, last_updated: new Date() }))
    .execute();
}

export async function updateAccountType(db: Kysely<Database>, memberId: string, accountType: string): Promise<void> {
  await db
    .updateTable('members')
    .set({ account_type: accountType, account_type_last_checked: new Date() })
    .where('member_id', '=', memberId)
    .execute();
}

export interface ItemMetadataInput {
  itemId: number;
  name: string;
  highAlch: number | null;
  lowAlch: number | null;
  tradeable: boolean;
  membersOnly: boolean | null;
}

export async function upsertItemMetadata(db: Kysely<Database>, input: ItemMetadataInput): Promise<void> {
  await db
    .insertInto('item_metadata')
    .values({
      item_id: input.itemId,
      name: input.name,
      high_alch: input.highAlch,
      low_alch: input.lowAlch,
      tradeable: input.tradeable,
      members_only: input.membersOnly,
    })
    .onConflict((oc) =>
      oc.column('item_id').doUpdateSet({
        name: input.name,
        high_alch: input.highAlch,
        low_alch: input.lowAlch,
        tradeable: input.tradeable,
        members_only: input.membersOnly,
        last_synced: new Date(),
      }),
    )
    .execute();
}

export interface SlayerTaskHistoryEntry {
  task: string;
  master: string | null;
  amountCompleted: number;
  outcome: string;
  completedAt: Date;
}

export async function getSlayerTaskHistory(
  db: Kysely<Database>,
  memberId: string,
  limit: number,
): Promise<SlayerTaskHistoryEntry[]> {
  const rows = await db
    .selectFrom('slayer_task_history')
    .select(['task', 'master', 'amount_completed', 'outcome', 'completed_at'])
    .where('member_id', '=', memberId)
    .orderBy('completed_at', 'desc')
    .limit(limit)
    .execute();

  return rows.map((r) => ({
    task: r.task,
    master: r.master,
    amountCompleted: r.amount_completed,
    outcome: r.outcome,
    completedAt: r.completed_at,
  }));
}

export interface ClueCompletionEntry {
  tier: string;
  completedAt: Date;
}

export async function getClueCompletions(
  db: Kysely<Database>,
  memberId: string,
  tier: string | undefined,
  limit: number,
): Promise<ClueCompletionEntry[]> {
  let query = db
    .selectFrom('clue_completions')
    .select(['tier', 'completed_at'])
    .where('member_id', '=', memberId)
    .orderBy('completed_at', 'desc')
    .limit(limit);

  if (tier !== undefined) {
    query = query.where('tier', '=', tier);
  }

  const rows = await query.execute();
  return rows.map((r) => ({ tier: r.tier, completedAt: r.completed_at }));
}

export interface DeathEntry {
  diedAt: Date;
  worldX: number | null;
  worldY: number | null;
  plane: number | null;
  killer: string | null;
}

export async function getDeaths(db: Kysely<Database>, memberId: string, limit: number): Promise<DeathEntry[]> {
  const rows = await db
    .selectFrom('deaths')
    .select(['died_at', 'world_x', 'world_y', 'plane', 'killer'])
    .where('member_id', '=', memberId)
    .orderBy('died_at', 'desc')
    .limit(limit)
    .execute();

  return rows.map((r) => ({ diedAt: r.died_at, worldX: r.world_x, worldY: r.world_y, plane: r.plane, killer: r.killer }));
}

export async function getHiscoreActivities(db: Kysely<Database>, memberId: string): Promise<Record<string, number>> {
  const rows = await db
    .selectFrom('hiscore_activities')
    .select(['activity_name', 'score'])
    .where('member_id', '=', memberId)
    .execute();

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.activity_name] = row.score;
  }
  return result;
}

export interface ItemMetadataEntry {
  name: string;
  highAlch: number | null;
  lowAlch: number | null;
  tradeable: boolean;
}

/** Missing ids are simply absent from the returned map, not an error. Empty input short-circuits. */
export async function getItemMetadataBatch(
  db: Kysely<Database>,
  itemIds: number[],
): Promise<Map<number, ItemMetadataEntry>> {
  const result = new Map<number, ItemMetadataEntry>();
  if (itemIds.length === 0) return result;

  const rows = await db
    .selectFrom('item_metadata')
    .select(['item_id', 'name', 'high_alch', 'low_alch', 'tradeable'])
    .where('item_id', 'in', itemIds)
    .execute();

  for (const row of rows) {
    result.set(row.item_id, { name: row.name, highAlch: row.high_alch, lowAlch: row.low_alch, tradeable: row.tradeable });
  }
  return result;
}
