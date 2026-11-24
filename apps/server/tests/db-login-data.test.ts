import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getLoginData } from '../src/db/login-data.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

const EPOCH = new Date(0);

describe('getLoginData', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  async function insertLogin(name: string): Promise<string> {
    const login = await testDb.db
      .insertInto('logins')
      .values({ login_name: name, token_hash: `hash-${name}` })
      .returning('login_id')
      .executeTakeFirstOrThrow();
    return login.login_id;
  }

  it('returns undefined for fields that were never set', async () => {
    const loginId = await insertLogin('Bare');

    const snapshot = await getLoginData(testDb.db, loginId, EPOCH);

    expect(snapshot).toBeDefined();
    expect(snapshot?.stats).toBeUndefined();
    expect(snapshot?.shared_bank).toBeUndefined();
    expect(snapshot?.deposited).toBeUndefined();
  });

  it('returns undefined when the login does not exist', async () => {
    expect(await getLoginData(testDb.db, '999999999', EPOCH)).toBeUndefined();
  });

  it('returns a field once set, and maps quests bytea to a plain number array', async () => {
    const loginId = await insertLogin('WithData');

    await testDb.db
      .updateTable('logins')
      .set({ stats: [1, 2, 3, 4, 5, 6], quests: Buffer.from([0, 1, 2, 255]) })
      .where('login_id', '=', loginId)
      .execute();

    const snapshot = await getLoginData(testDb.db, loginId, EPOCH);
    expect(snapshot?.stats).toEqual([1, 2, 3, 4, 5, 6]);
    expect(snapshot?.quests).toEqual([0, 1, 2, 255]);
  });

  it('returns the real shared_bank value, not a hardcoded stub', async () => {
    const loginId = await insertLogin('SharedBankTest');

    await testDb.db.updateTable('logins').set({ shared_bank: [10, 20] }).where('login_id', '=', loginId).execute();

    const snapshot = await getLoginData(testDb.db, loginId, EPOCH);
    expect(snapshot?.shared_bank).toEqual([10, 20]);
  });

  it('omits fields updated before the `since` cutoff (incremental fetch)', async () => {
    const loginId = await insertLogin('Incremental');

    await testDb.db.updateTable('logins').set({ skills: new Array(24).fill(0) }).where('login_id', '=', loginId).execute();

    const future = new Date(Date.now() + 60_000);
    const futureSnapshot = await getLoginData(testDb.db, loginId, future);
    expect(futureSnapshot?.skills).toBeUndefined();

    const past = new Date(0);
    const pastSnapshot = await getLoginData(testDb.db, loginId, past);
    expect(pastSnapshot?.skills).toEqual(new Array(24).fill(0));
  });

  it('returns account_type regardless of the since cutoff (not trigger-gated)', async () => {
    const loginId = await insertLogin('AccountTyped');
    await testDb.db.updateTable('logins').set({ account_type: 'ironman' }).where('login_id', '=', loginId).execute();

    const future = new Date(Date.now() + 60_000);
    const snapshot = await getLoginData(testDb.db, loginId, future);
    expect(snapshot?.account_type).toBe('ironman');
  });
});
