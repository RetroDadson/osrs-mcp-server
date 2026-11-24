import { type Kysely, sql } from 'kysely';

/**
 * Stores the ammo held in Dizana's quiver as a flat `[itemId, quantity]` pair. The plugin has always
 * sent it, but there was no column for it, so it was silently dropped. Gets the same per-column
 * `quiver_last_update` trigger as the other snapshot columns in the baseline, so incremental
 * `get-data` reads pick up quiver changes.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE osrsmcp.logins ADD COLUMN quiver_last_update TIMESTAMPTZ, ADD COLUMN quiver INTEGER[]`.execute(
    db,
  );
  await sql`
    CREATE OR REPLACE FUNCTION osrsmcp.update_quiver_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.quiver_last_update = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER set_quiver_timestamp
    BEFORE UPDATE ON osrsmcp.logins
    FOR EACH ROW
    WHEN (OLD.quiver IS DISTINCT FROM NEW.quiver)
    EXECUTE FUNCTION osrsmcp.update_quiver_timestamp()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TRIGGER set_quiver_timestamp ON osrsmcp.logins`.execute(db);
  await sql`DROP FUNCTION osrsmcp.update_quiver_timestamp()`.execute(db);
  await sql`ALTER TABLE osrsmcp.logins DROP COLUMN quiver, DROP COLUMN quiver_last_update`.execute(db);
}
