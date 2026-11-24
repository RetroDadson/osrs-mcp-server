import { type Kysely, sql } from 'kysely';

/**
 * Stops storing anything that reveals where a player is or was. Inherited from Group Ironmen
 * Tracker (whose site drew group members on a live map), but this project has no map, raw tile
 * coordinates mean nothing to an AI assistant, and a live position plus world number is enough to
 * find - and target - a player in-game.
 *
 * - `logins.coordinates` (live position) is dropped.
 * - `logins.stats` loses its 7th element, the world number: [hp, hp max, prayer, prayer max,
 *   energy, energy max, world] becomes the first six.
 * - `logins.interacting` loses `location`, the interaction target's position.
 * - `deaths` loses `world_x`, `world_y` and `plane`.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  // The baseline's per-column timestamp trigger depends on `coordinates`, so it has to go first.
  await sql`DROP TRIGGER set_coordinates_timestamp ON osrsmcp.logins`.execute(db);
  await sql`DROP FUNCTION osrsmcp.update_coordinates_timestamp()`.execute(db);
  await sql`ALTER TABLE osrsmcp.logins DROP COLUMN coordinates, DROP COLUMN coordinates_last_update`.execute(db);
  await sql`UPDATE osrsmcp.logins SET stats = stats[1:6] WHERE cardinality(stats) > 6`.execute(db);
  await sql`UPDATE osrsmcp.logins SET interacting = interacting - 'location' WHERE interacting ? 'location'`.execute(
    db,
  );
  await sql`ALTER TABLE osrsmcp.deaths DROP COLUMN world_x, DROP COLUMN world_y, DROP COLUMN plane`.execute(db);
}

/** Restores the columns' shape only. The dropped location data is gone for good. */
export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE osrsmcp.deaths ADD COLUMN world_x INTEGER, ADD COLUMN world_y INTEGER, ADD COLUMN plane INTEGER`.execute(
    db,
  );
  await sql`ALTER TABLE osrsmcp.logins ADD COLUMN coordinates_last_update TIMESTAMPTZ, ADD COLUMN coordinates INTEGER[]`.execute(
    db,
  );
  await sql`
    CREATE OR REPLACE FUNCTION osrsmcp.update_coordinates_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.coordinates_last_update = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER set_coordinates_timestamp
    BEFORE UPDATE ON osrsmcp.logins
    FOR EACH ROW
    WHEN (OLD.coordinates IS DISTINCT FROM NEW.coordinates)
    EXECUTE FUNCTION osrsmcp.update_coordinates_timestamp()
  `.execute(db);
}
