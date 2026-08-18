import { type Kysely, sql } from 'kysely';

/**
 * Columns that get a per-column `BEFORE UPDATE ... WHEN (OLD.x IS DISTINCT FROM NEW.x)` trigger
 * stamping `<name>_last_update = now()`. This is what makes `getGroupData`'s incremental
 * "only return fields that changed since timestamp X" read pattern correct even though the
 * batcher writes many columns in one wide UPDATE statement - skip this and that optimization
 * silently breaks. `account_type` is deliberately excluded: its timestamp
 * (`account_type_last_checked`) is set explicitly by the hiscores poller, not trigger-driven.
 */
const TRIGGERED_COLUMNS = [
  'stats',
  'coordinates',
  'skills',
  'quests',
  'inventory',
  'equipment',
  'rune_pouch',
  'bank',
  'seed_vault',
  'interacting',
  'diary_vars',
  'collection_log',
  'potion_storage',
  'slayer_task',
  'combat_achievements',
  'farming_patches',
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE SCHEMA IF NOT EXISTS osrsmcp`.execute(db);
  await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(db);

  await sql`
    CREATE TABLE osrsmcp.groups (
      group_id BIGSERIAL PRIMARY KEY,
      group_name TEXT NOT NULL,
      group_token_hash TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 2,
      UNIQUE (group_name, group_token_hash)
    )
  `.execute(db);

  await sql`
    CREATE TABLE osrsmcp.members (
      member_id BIGSERIAL PRIMARY KEY,
      group_id BIGINT NOT NULL REFERENCES osrsmcp.groups (group_id) ON DELETE CASCADE,
      member_name CITEXT NOT NULL,

      stats_last_update TIMESTAMPTZ,
      stats INTEGER[],

      coordinates_last_update TIMESTAMPTZ,
      coordinates INTEGER[],

      skills_last_update TIMESTAMPTZ,
      skills INTEGER[],

      quests_last_update TIMESTAMPTZ,
      quests BYTEA,

      inventory_last_update TIMESTAMPTZ,
      inventory INTEGER[],

      equipment_last_update TIMESTAMPTZ,
      equipment INTEGER[],

      rune_pouch_last_update TIMESTAMPTZ,
      rune_pouch INTEGER[],

      bank_last_update TIMESTAMPTZ,
      bank INTEGER[],

      seed_vault_last_update TIMESTAMPTZ,
      seed_vault INTEGER[],

      interacting_last_update TIMESTAMPTZ,
      interacting JSONB,

      diary_vars_last_update TIMESTAMPTZ,
      diary_vars INTEGER[],

      collection_log_last_update TIMESTAMPTZ,
      collection_log INTEGER[],

      potion_storage_last_update TIMESTAMPTZ,
      potion_storage INTEGER[],

      slayer_task_last_update TIMESTAMPTZ,
      slayer_task JSONB,

      combat_achievements_last_update TIMESTAMPTZ,
      combat_achievements INTEGER[],

      account_type TEXT,
      account_type_last_checked TIMESTAMPTZ,

      farming_patches_last_update TIMESTAMPTZ,
      farming_patches JSONB
    )
  `.execute(db);

  await sql`CREATE UNIQUE INDEX members_group_id_name_idx ON osrsmcp.members (group_id, member_name)`.execute(db);

  for (const period of ['day', 'month', 'year'] as const) {
    await sql`
      CREATE TABLE ${sql.raw(`osrsmcp.skills_${period}`)} (
        member_id BIGINT NOT NULL REFERENCES osrsmcp.members (member_id) ON DELETE CASCADE,
        time TIMESTAMPTZ NOT NULL,
        skills INTEGER[] NOT NULL,
        PRIMARY KEY (member_id, time)
      )
    `.execute(db);
  }

  await sql`
    CREATE TABLE osrsmcp.aggregation_info (
      type TEXT PRIMARY KEY,
      last_aggregation TIMESTAMPTZ NOT NULL DEFAULT 'epoch'
    )
  `.execute(db);
  await sql`INSERT INTO osrsmcp.aggregation_info (type) VALUES ('skills')`.execute(db);

  await sql`
    CREATE TABLE osrsmcp.slayer_task_history (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL REFERENCES osrsmcp.members (member_id) ON DELETE CASCADE,
      task TEXT NOT NULL,
      master TEXT,
      amount_completed INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);
  await sql`
    CREATE INDEX slayer_task_history_member_idx ON osrsmcp.slayer_task_history (member_id, completed_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE osrsmcp.hiscore_activities (
      member_id BIGINT NOT NULL REFERENCES osrsmcp.members (member_id) ON DELETE CASCADE,
      activity_name TEXT NOT NULL,
      score INTEGER NOT NULL,
      last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (member_id, activity_name)
    )
  `.execute(db);

  await sql`
    CREATE TABLE osrsmcp.clue_completions (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL REFERENCES osrsmcp.members (member_id) ON DELETE CASCADE,
      tier TEXT NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);
  await sql`
    CREATE INDEX clue_completions_member_idx ON osrsmcp.clue_completions (member_id, tier, completed_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE osrsmcp.deaths (
      id BIGSERIAL PRIMARY KEY,
      member_id BIGINT NOT NULL REFERENCES osrsmcp.members (member_id) ON DELETE CASCADE,
      died_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      world_x INTEGER,
      world_y INTEGER,
      plane INTEGER,
      killer TEXT
    )
  `.execute(db);
  await sql`CREATE INDEX deaths_member_idx ON osrsmcp.deaths (member_id, died_at DESC)`.execute(db);

  await sql`
    CREATE TABLE osrsmcp.item_metadata (
      item_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      high_alch INTEGER,
      low_alch INTEGER,
      tradeable BOOLEAN NOT NULL DEFAULT FALSE,
      members_only BOOLEAN,
      last_synced TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.execute(db);

  for (const column of TRIGGERED_COLUMNS) {
    await sql`
      CREATE OR REPLACE FUNCTION ${sql.raw(`osrsmcp.update_${column}_timestamp`)}()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.${sql.raw(`${column}_last_update`)} = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `.execute(db);

    await sql`
      CREATE TRIGGER ${sql.raw(`set_${column}_timestamp`)}
      BEFORE UPDATE ON osrsmcp.members
      FOR EACH ROW
      WHEN (OLD.${sql.raw(column)} IS DISTINCT FROM NEW.${sql.raw(column)})
      EXECUTE FUNCTION ${sql.raw(`osrsmcp.update_${column}_timestamp`)}()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP SCHEMA IF EXISTS osrsmcp CASCADE`.execute(db);
}
