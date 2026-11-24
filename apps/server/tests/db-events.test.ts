import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getClueCompletions,
  getDeaths,
  getHiscoreActivities,
  getItemMetadataBatch,
  getSlayerTaskHistory,
  recordClueCompletion,
  recordDeath,
  recordSlayerTaskCompletion,
  reportAccountType,
  updateAccountType,
  upsertHiscoreActivity,
  upsertItemMetadata,
} from '../src/db/events.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('events', () => {
  let testDb: TestDb;
  let loginId: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    const login = await testDb.db
      .insertInto('logins')
      .values({ login_name: 'eventstest', token_hash: 'h' })
      .returning('login_id')
      .executeTakeFirstOrThrow();
    loginId = login.login_id;
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('records slayer task completions as independent rows, most recent first', async () => {
    await recordSlayerTaskCompletion(testDb.db, loginId, {
      task: 'Gargoyles',
      master: 'Duradel',
      amountCompleted: 130,
      outcome: 'completed',
    });
    await recordSlayerTaskCompletion(testDb.db, loginId, {
      task: 'Cows',
      master: null,
      amountCompleted: 5,
      outcome: 'skipped',
    });

    const history = await getSlayerTaskHistory(testDb.db, loginId, 20);
    expect(history).toHaveLength(2);
    expect(history[0]?.task).toBe('Cows');
    expect(history[1]?.master).toBe('Duradel');
  });

  it('respects the limit parameter', async () => {
    const history = await getSlayerTaskHistory(testDb.db, loginId, 1);
    expect(history).toHaveLength(1);
  });

  it('records clue completions and filters by tier', async () => {
    await recordClueCompletion(testDb.db, loginId, 'easy');
    await recordClueCompletion(testDb.db, loginId, 'master');

    const all = await getClueCompletions(testDb.db, loginId, undefined, 20);
    expect(all.length).toBeGreaterThanOrEqual(2);

    const masterOnly = await getClueCompletions(testDb.db, loginId, 'master', 20);
    expect(masterOnly.every((c) => c.tier === 'master')).toBe(true);
  });

  it('records deaths with an optional killer and no location', async () => {
    await recordDeath(testDb.db, loginId, { killer: 'Gargoyle' });
    await recordDeath(testDb.db, loginId, { killer: null });

    const deaths = await getDeaths(testDb.db, loginId, 20);
    expect(deaths).toHaveLength(2);
    expect(deaths.some((d) => d.killer === 'Gargoyle')).toBe(true);
    expect(deaths.some((d) => d.killer === null)).toBe(true);
    for (const death of deaths) {
      expect(Object.keys(death).sort()).toEqual(['diedAt', 'killer']);
    }
  });

  it('upserts hiscore activities without duplicating (overwrite-not-insert on conflict)', async () => {
    await upsertHiscoreActivity(testDb.db, loginId, 'Zulrah', 100);
    await upsertHiscoreActivity(testDb.db, loginId, 'Zulrah', 150);

    const activities = await getHiscoreActivities(testDb.db, loginId);
    expect(activities.Zulrah).toBe(150);
  });

  it('updateAccountType stamps account_type_last_checked', async () => {
    await updateAccountType(testDb.db, loginId, 'hardcore_ironman');
    const login = await testDb.db
      .selectFrom('logins')
      .select(['account_type', 'account_type_last_checked'])
      .where('login_id', '=', loginId)
      .executeTakeFirstOrThrow();

    expect(login.account_type).toBe('hardcore_ironman');
    expect(login.account_type_last_checked).not.toBeNull();
  });

  it('a plugin-reported account type overrides hiscores, and hiscores never overwrites it back', async () => {
    const { login_id: id } = await testDb.db
      .insertInto('logins')
      .values({ login_name: 'gimtest', token_hash: 'h-gim' })
      .returning('login_id')
      .executeTakeFirstOrThrow();
    const read = () =>
      testDb.db
        .selectFrom('logins')
        .select(['account_type', 'account_type_source'])
        .where('login_id', '=', id)
        .executeTakeFirstOrThrow();

    await updateAccountType(testDb.db, id, 'regular');
    expect(await read()).toEqual({ account_type: 'regular', account_type_source: 'hiscores' });

    await reportAccountType(testDb.db, id, 'group_ironman');
    expect(await read()).toEqual({ account_type: 'group_ironman', account_type_source: 'plugin' });

    // GIM players rank on the regular hiscores board - the poller must not clobber the real type.
    await updateAccountType(testDb.db, id, 'regular');
    expect(await read()).toEqual({ account_type: 'group_ironman', account_type_source: 'plugin' });

    await reportAccountType(testDb.db, id, 'hardcore_group_ironman');
    expect(await read()).toEqual({ account_type: 'hardcore_group_ironman', account_type_source: 'plugin' });
  });

  it('upserts item metadata without duplicating', async () => {
    await upsertItemMetadata(testDb.db, {
      itemId: 4151,
      name: 'Abyssal whip',
      highAlch: 72000,
      lowAlch: 48000,
      tradeable: true,
      membersOnly: true,
    });
    await upsertItemMetadata(testDb.db, {
      itemId: 4151,
      name: 'Abyssal whip',
      highAlch: 75000,
      lowAlch: 50000,
      tradeable: true,
      membersOnly: true,
    });

    const batch = await getItemMetadataBatch(testDb.db, [4151]);
    expect(batch.get(4151)?.highAlch).toBe(75000);
  });

  it('getItemMetadataBatch omits unknown ids and short-circuits on empty input', async () => {
    const batch = await getItemMetadataBatch(testDb.db, [999999]);
    expect(batch.has(999999)).toBe(false);

    const empty = await getItemMetadataBatch(testDb.db, []);
    expect(empty.size).toBe(0);
  });
});
