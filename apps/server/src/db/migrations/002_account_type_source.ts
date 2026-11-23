import { type Kysely, sql } from 'kysely';

/**
 * Records where `account_type` came from. The plugin reads the game mode straight from the client
 * (`'plugin'`) and is authoritative - it is the only source that can tell Group Ironman variants
 * apart, since the OSRS Hiscores rank GIM players on the regular board. The hiscores poller
 * (`'hiscores'`) only fills the value in until the plugin has reported one, and never overwrites
 * a plugin-reported value.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE osrsmcp.logins ADD COLUMN account_type_source TEXT`.execute(db);
  await sql`UPDATE osrsmcp.logins SET account_type_source = 'hiscores' WHERE account_type IS NOT NULL`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE osrsmcp.logins DROP COLUMN account_type_source`.execute(db);
}
