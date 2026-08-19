import { sql, type Kysely } from 'kysely';
import type { FarmingPatch, Member, Interacting, SlayerTask } from '@osrs-mcp/shared';
import type { Database } from './types.js';

/**
 * Every trigger-backed snapshot category. Mirrors `TRIGGERED_COLUMNS` in the baseline migration -
 * these are exactly the columns `getLoginData`'s incremental "only return what changed since
 * timestamp X" projection gates on, and the set `GREATEST(...)` is computed over to produce
 * `last_updated`. `account_type` is intentionally excluded (see the migration's own note: its
 * timestamp is set explicitly by the hiscores poller, not trigger-driven).
 */
const SNAPSHOT_COLUMNS = [
  'stats',
  'coordinates',
  'skills',
  'quests',
  'inventory',
  'equipment',
  'bank',
  'rune_pouch',
  'interacting',
  'seed_vault',
  'diary_vars',
  'collection_log',
  'potion_storage',
  'slayer_task',
  'combat_achievements',
  'farming_patches',
] as const;

interface LoginDataRow {
  member_name: string;
  last_updated: Date | null;
  stats: number[] | null;
  coordinates: number[] | null;
  skills: number[] | null;
  quests: Buffer | null;
  inventory: number[] | null;
  equipment: number[] | null;
  bank: number[] | null;
  rune_pouch: number[] | null;
  interacting: Interacting | null;
  seed_vault: number[] | null;
  diary_vars: number[] | null;
  collection_log: number[] | null;
  potion_storage: number[] | null;
  slayer_task: SlayerTask | null;
  combat_achievements: number[] | null;
  farming_patches: FarmingPatch[] | null;
  account_type: string | null;
}

/**
 * Only returns fields whose `*_last_update` is at/after `since` (bandwidth optimization the
 * plugin client uses for incremental polling; MCP tools instead always pass epoch to force a
 * full read). Includes the synthetic `@SHARED` member like the rest of the login - callers that
 * want the shared bank should look up that row's own `bank` field.
 *
 * `shared_bank` and `deposited` are always `undefined`: neither is stored per-member (shared
 * bank contents live on `@SHARED`'s own `bank` column; `deposited` is a write-only/ephemeral
 * batcher input, never read back).
 */
export async function getLoginData(db: Kysely<Database>, loginId: string, since: Date): Promise<Member[]> {
  const greatestExpr = sql.join(
    SNAPSHOT_COLUMNS.map((c) => sql.ref(`${c}_last_update`)),
    sql`, `,
  );
  const caseExprs = SNAPSHOT_COLUMNS.map(
    (c) =>
      sql`CASE WHEN ${sql.ref(`${c}_last_update`)} >= ${since} THEN ${sql.ref(c)} ELSE NULL END AS ${sql.raw(c)}`,
  );

  const query = sql<LoginDataRow>`
    SELECT
      member_name,
      GREATEST(${greatestExpr}) AS last_updated,
      ${sql.join(caseExprs, sql`, `)},
      account_type
    FROM osrsmcp.members
    WHERE login_id = ${loginId}
  `;

  const { rows } = await query.execute(db);
  return rows.map(rowToMember);
}

function rowToMember(row: LoginDataRow): Member {
  return {
    name: row.member_name,
    stats: row.stats ?? undefined,
    coordinates: row.coordinates ?? undefined,
    skills: row.skills ?? undefined,
    quests: row.quests ? Array.from(row.quests) : undefined,
    inventory: row.inventory ?? undefined,
    equipment: row.equipment ?? undefined,
    bank: row.bank ?? undefined,
    shared_bank: undefined,
    rune_pouch: row.rune_pouch ?? undefined,
    interacting: row.interacting ?? undefined,
    seed_vault: row.seed_vault ?? undefined,
    deposited: undefined,
    diary_vars: row.diary_vars ?? undefined,
    collection_log_v2: row.collection_log ?? undefined,
    potion_storage: row.potion_storage ?? undefined,
    slayer_task: row.slayer_task ?? undefined,
    combat_achievements: row.combat_achievements ?? undefined,
    farming_patches: row.farming_patches ?? undefined,
    account_type: row.account_type ?? undefined,
    last_updated: row.last_updated?.toISOString(),
  };
}
