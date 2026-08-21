import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogin, getLoginByTokenHash, listAllLogins, renameLogin } from '../src/db/logins.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('logins', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('creates a login with just a name and a token hash', async () => {
    await createLogin(testDb.db, { name: 'alpha', tokenHash: 'hash-alpha' });

    const login = await getLoginByTokenHash(testDb.db, 'hash-alpha');
    expect(login).toEqual({ loginId: expect.any(String), loginName: 'alpha' });
  });

  it('getLoginByTokenHash returns undefined for a wrong token hash', async () => {
    await createLogin(testDb.db, { name: 'authtest', tokenHash: 'right-hash' });
    expect(await getLoginByTokenHash(testDb.db, 'wrong-hash')).toBeUndefined();
  });

  it('renameLogin updates the login name', async () => {
    await createLogin(testDb.db, { name: 'renametest', tokenHash: 'rename-hash' });
    const login = await getLoginByTokenHash(testDb.db, 'rename-hash');

    await renameLogin(testDb.db, login!.loginId, 'renamed');
    const after = await getLoginByTokenHash(testDb.db, 'rename-hash');
    expect(after?.loginName).toBe('renamed');
  });

  it('listAllLogins spans every login', async () => {
    await createLogin(testDb.db, { name: 'spanA', tokenHash: 'span-hash-a' });
    await createLogin(testDb.db, { name: 'spanB', tokenHash: 'span-hash-b' });

    const all = await listAllLogins(testDb.db);
    const names = all.map((l) => l.loginName);
    expect(names).toContain('spanA');
    expect(names).toContain('spanB');
  });
});
