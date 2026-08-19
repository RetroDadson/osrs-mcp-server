import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import { getLoginData } from '../src/db/login-data.js';
import { createLogin, getLoginIdByToken } from '../src/db/logins.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

const EPOCH = new Date(0);

describe('getLoginData', () => {
  let testDb: TestDb;
  let loginId: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    const login = await testDb.db
      .insertInto('logins')
      .values({ login_name: 'gdtest', token_hash: 'h' })
      .returning('login_id')
      .executeTakeFirstOrThrow();
    loginId = login.login_id;
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('returns undefined for fields that were never set', async () => {
    await testDb.db.insertInto('members').values({ login_id: loginId, member_name: 'Bare' }).execute();

    const bare = (await getLoginData(testDb.db, loginId, EPOCH)).find((m) => m.name === 'Bare');

    expect(bare).toBeDefined();
    expect(bare?.stats).toBeUndefined();
    expect(bare?.shared_bank).toBeUndefined();
    expect(bare?.deposited).toBeUndefined();
  });

  it('returns a field once set, and maps quests bytea to a plain number array', async () => {
    const inserted = await testDb.db
      .insertInto('members')
      .values({ login_id: loginId, member_name: 'WithData' })
      .returning('member_id')
      .executeTakeFirstOrThrow();

    await testDb.db
      .updateTable('members')
      .set({ stats: [1, 2, 3, 4, 5, 6, 7], quests: Buffer.from([0, 1, 2, 255]) })
      .where('member_id', '=', inserted.member_id)
      .execute();

    const member = (await getLoginData(testDb.db, loginId, EPOCH)).find((m) => m.name === 'WithData');
    expect(member?.stats).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(member?.quests).toEqual([0, 1, 2, 255]);
  });

  it('omits fields updated before the `since` cutoff (incremental fetch)', async () => {
    const inserted = await testDb.db
      .insertInto('members')
      .values({ login_id: loginId, member_name: 'Incremental' })
      .returning('member_id')
      .executeTakeFirstOrThrow();

    await testDb.db
      .updateTable('members')
      .set({ skills: new Array(24).fill(0) })
      .where('member_id', '=', inserted.member_id)
      .execute();

    const future = new Date(Date.now() + 60_000);
    const member = (await getLoginData(testDb.db, loginId, future)).find((m) => m.name === 'Incremental');
    expect(member?.skills).toBeUndefined();

    const past = new Date(0);
    const memberFromEpoch = (await getLoginData(testDb.db, loginId, past)).find((m) => m.name === 'Incremental');
    expect(memberFromEpoch?.skills).toEqual(new Array(24).fill(0));
  });

  it('returns account_type regardless of the since cutoff (not trigger-gated)', async () => {
    await testDb.db
      .insertInto('members')
      .values({ login_id: loginId, member_name: 'AccountTyped', account_type: 'ironman' })
      .execute();

    const future = new Date(Date.now() + 60_000);
    const member = (await getLoginData(testDb.db, loginId, future)).find((m) => m.name === 'AccountTyped');
    expect(member?.account_type).toBe('ironman');
  });

  it('includes the @SHARED member like any other row (createLogin seeds one per login)', async () => {
    await createLogin(testDb.db, { name: 'sharedtest', memberNames: ['realmember'], tokenHash: 'sharedhash' });
    const sharedLoginId = await getLoginIdByToken(testDb.db, 'sharedtest', 'sharedhash');

    const members = await getLoginData(testDb.db, sharedLoginId!, EPOCH);
    expect(members.some((m) => m.name === SHARED_MEMBER)).toBe(true);
  });
});
