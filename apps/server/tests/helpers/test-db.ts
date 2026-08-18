import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { Kysely } from 'kysely';
import { createDb, createPool, createRawDb } from '../../src/db/pool.js';
import { migrateToLatest } from '../../src/db/migrate.js';
import type { Database } from '../../src/db/types.js';
import type pg from 'pg';

export interface TestDb {
  container: StartedPostgreSqlContainer;
  pool: pg.Pool;
  db: Kysely<Database>;
}

export async function startTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const pool = createPool(container.getConnectionUri());
  await migrateToLatest(createRawDb(pool) as unknown as Kysely<unknown>);
  const db = createDb(pool);
  return { container, pool, db };
}

export async function stopTestDb(testDb: TestDb): Promise<void> {
  await testDb.db.destroy();
  await testDb.container.stop();
}
