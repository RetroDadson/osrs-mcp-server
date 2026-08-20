import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createRawDb } from '../src/db/pool.js';
import { migrateToLatest } from '../src/db/migrate.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('baseline migration', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('creates every expected table in the osrsmcp schema', async () => {
    const rows = await sql<{ table_name: string }>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'osrsmcp' ORDER BY table_name
    `.execute(testDb.db);

    const tableNames = rows.rows.map((r) => r.table_name);
    expect(tableNames).toEqual([
      'aggregation_info',
      'clue_completions',
      'deaths',
      'hiscore_activities',
      'item_metadata',
      'logins',
      'skills_day',
      'skills_month',
      'skills_year',
      'slayer_task_history',
    ]);
  });

  it('is idempotent - migrating twice does not error or duplicate', async () => {
    await expect(migrateToLatest(createRawDb(testDb.pool) as never)).resolves.not.toThrow();
  });

  it('seeds aggregation_info with a skills row', async () => {
    const row = await testDb.db
      .selectFrom('aggregation_info')
      .selectAll()
      .where('type', '=', 'skills')
      .executeTakeFirst();
    expect(row).toBeDefined();
  });

  it('round-trips a jsonb slayer_task snapshot', async () => {
    const slayerTask = {
      task: 'Gargoyles',
      amount_remaining: 5,
      initial_amount: 10,
      points: 2,
      task_streak: 1,
      wilderness_streak: 0,
    };

    const login = await testDb.db
      .insertInto('logins')
      .values({ login_name: 'jsonb-test', token_hash: 'hash', slayer_task: slayerTask })
      .returning('login_id')
      .executeTakeFirstOrThrow();

    const found = await testDb.db
      .selectFrom('logins')
      .select('slayer_task')
      .where('login_id', '=', login.login_id)
      .executeTakeFirstOrThrow();

    expect(found.slayer_task).toEqual(slayerTask);
  });

  it('returns bigserial ids as strings (safe for int8 precision)', async () => {
    const login = await testDb.db
      .insertInto('logins')
      .values({ login_name: 'bigint-test', token_hash: 'hash' })
      .returning('login_id')
      .executeTakeFirstOrThrow();

    expect(typeof login.login_id).toBe('string');
  });

  it.each([
    'stats',
    'coordinates',
    'skills',
    'inventory',
    'equipment',
    'bank',
    'shared_bank',
    'rune_pouch',
    'seed_vault',
    'diary_vars',
    'collection_log',
    'potion_storage',
    'combat_achievements',
  ] as const)('stamps %s_last_update only when %s actually changes', async (column) => {
    // The trigger only fires on UPDATE (matching the batcher's real write path - logins are
    // created bare, then populated), so *_last_update starts NULL right after INSERT.
    const inserted = await testDb.db
      .insertInto('logins')
      .values({ login_name: `trigger-test-${column}`, token_hash: `hash-${column}` })
      .returning('login_id')
      .executeTakeFirstOrThrow();

    await testDb.db
      .updateTable('logins')
      .set({ [column]: [1, 2, 3] })
      .where('login_id', '=', inserted.login_id)
      .execute();

    const login = await testDb.db
      .selectFrom('logins')
      .select(['login_id', `${column}_last_update` as never])
      .where('login_id', '=', inserted.login_id)
      .executeTakeFirstOrThrow();

    const firstStamp = (login as Record<string, unknown>)[`${column}_last_update`];
    expect(firstStamp).not.toBeNull();

    // Updating an unrelated column must NOT move this column's timestamp.
    await testDb.db
      .updateTable('logins')
      .set({ account_type: 'ironman' })
      .where('login_id', '=', login.login_id)
      .execute();

    const afterUnrelatedUpdate = await testDb.db
      .selectFrom('logins')
      .select(`${column}_last_update` as never)
      .where('login_id', '=', login.login_id)
      .executeTakeFirstOrThrow();
    expect((afterUnrelatedUpdate as Record<string, unknown>)[`${column}_last_update`]).toEqual(firstStamp);

    // Updating the column itself to a genuinely different value DOES move the timestamp.
    await new Promise((r) => setTimeout(r, 5));
    await testDb.db
      .updateTable('logins')
      .set({ [column]: [9, 9, 9] })
      .where('login_id', '=', login.login_id)
      .execute();

    const afterRealUpdate = await testDb.db
      .selectFrom('logins')
      .select(`${column}_last_update` as never)
      .where('login_id', '=', login.login_id)
      .executeTakeFirstOrThrow();
    expect((afterRealUpdate as Record<string, unknown>)[`${column}_last_update`]).not.toEqual(firstStamp);
  });
});
