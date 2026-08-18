import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './types.js';

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}

/**
 * Unscoped instance, used only by the migrator: migration 001 is what creates the `osrsmcp`
 * schema, so Kysely's own migration-tracking tables must live outside it (in `public`) and
 * can't be created through a `.withSchema('osrsmcp')`-scoped instance - see migrate.ts.
 */
export function createRawDb(pool: pg.Pool): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
}

/** All app tables live in `osrsmcp` - this is the instance every query function should use. */
export function createDb(pool: pg.Pool): Kysely<Database> {
  return createRawDb(pool).withSchema('osrsmcp');
}
