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
      'groups',
      'hiscore_activities',
      'item_metadata',
      'members',
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

  it('treats member_name as case-insensitive (citext)', async () => {
    const group = await testDb.db
      .insertInto('groups')
      .values({ group_name: 'citext-test', group_token_hash: 'hash' })
      .returning('group_id')
      .executeTakeFirstOrThrow();

    await testDb.db.insertInto('members').values({ group_id: group.group_id, member_name: 'Zezima' }).execute();

    const found = await testDb.db
      .selectFrom('members')
      .selectAll()
      .where('group_id', '=', group.group_id)
      .where('member_name', '=', 'ZEZIMA')
      .executeTakeFirst();

    expect(found).toBeDefined();
    expect(found?.member_name).toBe('Zezima');
  });

  it('round-trips a jsonb slayer_task snapshot', async () => {
    const group = await testDb.db
      .insertInto('groups')
      .values({ group_name: 'jsonb-test', group_token_hash: 'hash' })
      .returning('group_id')
      .executeTakeFirstOrThrow();

    const slayerTask = {
      task: 'Gargoyles',
      amount_remaining: 5,
      initial_amount: 10,
      points: 2,
      task_streak: 1,
      wilderness_streak: 0,
    };

    await testDb.db
      .insertInto('members')
      .values({ group_id: group.group_id, member_name: 'JsonbMember', slayer_task: slayerTask })
      .execute();

    const found = await testDb.db
      .selectFrom('members')
      .select('slayer_task')
      .where('group_id', '=', group.group_id)
      .executeTakeFirstOrThrow();

    expect(found.slayer_task).toEqual(slayerTask);
  });

  it('returns bigserial ids as strings (safe for int8 precision)', async () => {
    const group = await testDb.db
      .insertInto('groups')
      .values({ group_name: 'bigint-test', group_token_hash: 'hash' })
      .returning('group_id')
      .executeTakeFirstOrThrow();

    expect(typeof group.group_id).toBe('string');
  });

  it.each([
    'stats',
    'coordinates',
    'skills',
    'inventory',
    'equipment',
    'bank',
    'rune_pouch',
    'seed_vault',
    'diary_vars',
    'collection_log',
    'potion_storage',
    'combat_achievements',
  ] as const)('stamps %s_last_update only when %s actually changes', async (column) => {
    const group = await testDb.db
      .insertInto('groups')
      .values({ group_name: `trigger-test-${column}`, group_token_hash: 'hash' })
      .returning('group_id')
      .executeTakeFirstOrThrow();

    // The trigger only fires on UPDATE (matching the batcher's real write path - members are
    // created bare, then populated), so *_last_update starts NULL right after INSERT.
    const inserted = await testDb.db
      .insertInto('members')
      .values({ group_id: group.group_id, member_name: 'TriggerMember' })
      .returning('member_id')
      .executeTakeFirstOrThrow();

    await testDb.db
      .updateTable('members')
      .set({ [column]: [1, 2, 3] })
      .where('member_id', '=', inserted.member_id)
      .execute();

    const member = await testDb.db
      .selectFrom('members')
      .select(['member_id', `${column}_last_update` as never])
      .where('member_id', '=', inserted.member_id)
      .executeTakeFirstOrThrow();

    const firstStamp = (member as Record<string, unknown>)[`${column}_last_update`];
    expect(firstStamp).not.toBeNull();

    // Updating an unrelated column must NOT move this column's timestamp.
    await testDb.db
      .updateTable('members')
      .set({ account_type: 'ironman' })
      .where('member_id', '=', member.member_id)
      .execute();

    const afterUnrelatedUpdate = await testDb.db
      .selectFrom('members')
      .select(`${column}_last_update` as never)
      .where('member_id', '=', member.member_id)
      .executeTakeFirstOrThrow();
    expect((afterUnrelatedUpdate as Record<string, unknown>)[`${column}_last_update`]).toEqual(firstStamp);

    // Updating the column itself to a genuinely different value DOES move the timestamp.
    await new Promise((r) => setTimeout(r, 5));
    await testDb.db
      .updateTable('members')
      .set({ [column]: [9, 9, 9] })
      .where('member_id', '=', member.member_id)
      .execute();

    const afterRealUpdate = await testDb.db
      .selectFrom('members')
      .select(`${column}_last_update` as never)
      .where('member_id', '=', member.member_id)
      .executeTakeFirstOrThrow();
    expect((afterRealUpdate as Record<string, unknown>)[`${column}_last_update`]).not.toEqual(firstStamp);
  });
});
