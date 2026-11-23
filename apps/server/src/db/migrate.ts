import type { Kysely } from 'kysely';
import { Migrator, type MigrationProvider } from 'kysely/migration';
import * as baseline from './migrations/001_baseline.js';
import * as accountTypeSource from './migrations/002_account_type_source.js';

const provider: MigrationProvider = {
  async getMigrations() {
    return {
      '001_baseline': baseline,
      '002_account_type_source': accountTypeSource,
    };
  },
};

/**
 * Kysely's own migration-tracking tables (`kysely_migration`/`kysely_migration_lock`) are left
 * in the default `public` schema deliberately - migration 001 is what creates the `osrsmcp`
 * schema in the first place, so tracking metadata can't live inside it from the start.
 */
export async function migrateToLatest(db: Kysely<unknown>): Promise<void> {
  const migrator = new Migrator({ db, provider });
  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Error') {
      throw new Error(`Migration "${result.migrationName}" failed`);
    }
  }

  if (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}
