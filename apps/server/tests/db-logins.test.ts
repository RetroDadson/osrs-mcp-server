import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import {
  addMember,
  createLogin,
  deleteMember,
  getLoginIdByToken,
  getMemberId,
  LoginFullError,
  isMemberPresent,
  listAllMembers,
  listMembers,
  MAX_MEMBERS_PER_LOGIN,
  renameMember,
} from '../src/db/logins.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('logins', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('creates a login with a @SHARED member plus each named member', async () => {
    await createLogin(testDb.db, { name: 'alpha', memberNames: ['alice', 'bob'], tokenHash: 'hash-alpha' });

    const loginId = await getLoginIdByToken(testDb.db, 'alpha', 'hash-alpha');
    expect(loginId).toBeDefined();

    const members = await listMembers(testDb.db, loginId!);
    expect(members.map((m) => m.name).sort()).toEqual(['alice', 'bob']);

    expect(await isMemberPresent(testDb.db, loginId!, SHARED_MEMBER)).toBe(true);
  });

  it('supports a solo (1-member) login', async () => {
    await createLogin(testDb.db, { name: 'solo', memberNames: ['justme'], tokenHash: 'hash-solo' });
    const loginId = await getLoginIdByToken(testDb.db, 'solo', 'hash-solo');
    const members = await listMembers(testDb.db, loginId!);
    expect(members).toHaveLength(1);
  });

  it('getLoginIdByToken returns undefined for a wrong token', async () => {
    await createLogin(testDb.db, { name: 'authtest', memberNames: ['a'], tokenHash: 'right-hash' });
    expect(await getLoginIdByToken(testDb.db, 'authtest', 'wrong-hash')).toBeUndefined();
  });

  it('addMember enforces the 5-member cap and excludes @SHARED from the count', async () => {
    await createLogin(testDb.db, { name: 'fulllogin', memberNames: ['a', 'b', 'c', 'd', 'e'], tokenHash: 'h' });
    const loginId = await getLoginIdByToken(testDb.db, 'fulllogin', 'h');

    expect(await listMembers(testDb.db, loginId!)).toHaveLength(MAX_MEMBERS_PER_LOGIN);
    await expect(addMember(testDb.db, loginId!, 'f')).rejects.toThrow(LoginFullError);
  });

  it('deleteMember removes the member and is a no-op for an unknown name', async () => {
    await createLogin(testDb.db, { name: 'deletetest', memberNames: ['toremove'], tokenHash: 'h' });
    const loginId = await getLoginIdByToken(testDb.db, 'deletetest', 'h');

    await deleteMember(testDb.db, loginId!, 'toremove');
    expect(await isMemberPresent(testDb.db, loginId!, 'toremove')).toBe(false);

    await expect(deleteMember(testDb.db, loginId!, 'never-existed')).resolves.not.toThrow();
  });

  it('renameMember updates the name', async () => {
    await createLogin(testDb.db, { name: 'renametest', memberNames: ['before'], tokenHash: 'h' });
    const loginId = await getLoginIdByToken(testDb.db, 'renametest', 'h');

    await renameMember(testDb.db, loginId!, 'before', 'after');
    expect(await isMemberPresent(testDb.db, loginId!, 'before')).toBe(false);
    expect(await isMemberPresent(testDb.db, loginId!, 'after')).toBe(true);
  });

  it('getMemberId resolves case-insensitively (citext)', async () => {
    await createLogin(testDb.db, { name: 'casetest', memberNames: ['MixedCase'], tokenHash: 'h' });
    const loginId = await getLoginIdByToken(testDb.db, 'casetest', 'h');

    expect(await getMemberId(testDb.db, loginId!, 'mixedcase')).toBeDefined();
    expect(await getMemberId(testDb.db, loginId!, 'MIXEDCASE')).toBeDefined();
  });

  it('listAllMembers spans every login and excludes @SHARED', async () => {
    await createLogin(testDb.db, { name: 'spanA', memberNames: ['spanmember1'], tokenHash: 'h' });
    await createLogin(testDb.db, { name: 'spanB', memberNames: ['spanmember2'], tokenHash: 'h2' });

    const all = await listAllMembers(testDb.db);
    const names = all.map((m) => m.memberName);
    expect(names).toContain('spanmember1');
    expect(names).toContain('spanmember2');
    expect(names).not.toContain(SHARED_MEMBER);
  });
});
