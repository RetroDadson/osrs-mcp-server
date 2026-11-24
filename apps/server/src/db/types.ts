import type { ColumnType, Generated } from 'kysely';
import type { AccountType, FarmingPatch, Interacting, SlayerTask } from '@osrs-mcp/shared';

/** A column with a DB-side default; optional on insert, always present on select. */
type WithDefault<T> = ColumnType<T, T | undefined, T>;

export interface LoginsTable {
  login_id: Generated<string>;
  login_name: string;
  token_hash: string;
  version: WithDefault<number>;

  stats_last_update: Date | null;
  stats: number[] | null;

  skills_last_update: Date | null;
  skills: number[] | null;

  quests_last_update: Date | null;
  quests: Buffer | null;

  inventory_last_update: Date | null;
  inventory: number[] | null;

  equipment_last_update: Date | null;
  equipment: number[] | null;

  rune_pouch_last_update: Date | null;
  rune_pouch: number[] | null;

  bank_last_update: Date | null;
  bank: number[] | null;

  /** Models the OSRS in-game Group Storage feature (tied to account type), not app-level sharing. */
  shared_bank_last_update: Date | null;
  shared_bank: number[] | null;

  seed_vault_last_update: Date | null;
  seed_vault: number[] | null;

  interacting_last_update: Date | null;
  interacting: Interacting | null;

  diary_vars_last_update: Date | null;
  diary_vars: number[] | null;

  /**
   * DB column stays `collection_log` (paired with `collection_log_last_update` for the generic
   * per-column trigger helper); the wire/MCP field name is `collection_log_v2` - mapped at the
   * query-function boundary, not here.
   */
  collection_log_last_update: Date | null;
  collection_log: number[] | null;

  potion_storage_last_update: Date | null;
  potion_storage: number[] | null;

  slayer_task_last_update: Date | null;
  slayer_task: SlayerTask | null;

  combat_achievements_last_update: Date | null;
  combat_achievements: number[] | null;

  account_type: AccountType | null;
  account_type_last_checked: Date | null;
  account_type_source: 'plugin' | 'hiscores' | null;

  farming_patches_last_update: Date | null;
  farming_patches: FarmingPatch[] | null;
}

export interface SkillsPeriodRow {
  login_id: string;
  time: Date;
  skills: number[];
}

export interface AggregationInfoTable {
  type: string;
  last_aggregation: Date;
}

export interface SlayerTaskHistoryTable {
  id: Generated<string>;
  login_id: string;
  task: string;
  master: string | null;
  amount_completed: number;
  outcome: string;
  completed_at: WithDefault<Date>;
}

export interface HiscoreActivitiesTable {
  login_id: string;
  activity_name: string;
  score: number;
  last_updated: WithDefault<Date>;
}

export interface ClueCompletionsTable {
  id: Generated<string>;
  login_id: string;
  tier: string;
  completed_at: WithDefault<Date>;
}

export interface DeathsTable {
  id: Generated<string>;
  login_id: string;
  died_at: WithDefault<Date>;
  killer: string | null;
}

export interface ItemMetadataTable {
  item_id: number;
  name: string;
  high_alch: number | null;
  low_alch: number | null;
  tradeable: WithDefault<boolean>;
  members_only: boolean | null;
  last_synced: WithDefault<Date>;
}

export interface Database {
  logins: LoginsTable;
  skills_day: SkillsPeriodRow;
  skills_month: SkillsPeriodRow;
  skills_year: SkillsPeriodRow;
  aggregation_info: AggregationInfoTable;
  slayer_task_history: SlayerTaskHistoryTable;
  hiscore_activities: HiscoreActivitiesTable;
  clue_completions: ClueCompletionsTable;
  deaths: DeathsTable;
  item_metadata: ItemMetadataTable;
}
