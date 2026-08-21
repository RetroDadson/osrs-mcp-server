import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tokenHash } from '../src/auth/index.js';
import { createLogin } from '../src/db/logins.js';
import { buildTestApp, closeTestApp, TEST_SECRET, type TestApp } from './helpers/test-app.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('authed routes', () => {
  let testDb: TestDb;
  let testApp: TestApp;
  const loginName = 'authedroutes';
  const token = 'the-token';

  beforeAll(async () => {
    testDb = await startTestDb();
    await createLogin(testDb.db, {
      name: loginName,
      tokenHash: tokenHash(token, TEST_SECRET),
    });
    testApp = await buildTestApp(testDb);
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(testApp);
    await stopTestDb(testDb);
  });

  function authed(overrides: Record<string, unknown> = {}) {
    return { headers: { authorization: token }, ...overrides };
  }

  it('rejects requests without an Authorization header with 400', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/am-i-logged-in' });
    expect(res.statusCode).toBe(400);
  });

  it('am-i-logged-in returns 200 with the resolved login_name', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/am-i-logged-in', ...authed() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ login_name: loginName });
  });

  it('rename updates the login name and rejects an invalid new name', async () => {
    await createLogin(testDb.db, { name: 'renametest', tokenHash: tokenHash('t', TEST_SECRET) });
    const ok = await testApp.app.inject({
      method: 'PUT',
      url: '/api/rename',
      headers: { authorization: 't' },
      payload: { new_name: 'renamed' },
    });
    expect(ok.statusCode).toBe(200);

    const check = await testApp.app.inject({ method: 'GET', url: '/api/am-i-logged-in', headers: { authorization: 't' } });
    expect(check.json()).toEqual({ login_name: 'renamed' });

    const bad = await testApp.app.inject({
      method: 'PUT',
      url: '/api/rename',
      headers: { authorization: 't' },
      payload: { new_name: 'not valid!!' },
    });
    expect(bad.statusCode).toBe(400);
  });

  describe('update', () => {
    it('accepts a partial update and eventually persists it via the batcher', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/update',
        ...authed({ payload: { name: loginName, stats: [1, 2, 3, 4, 5, 6, 7] } }),
      });
      expect(res.statusCode).toBe(200);

      await testApp.batcher.flush();
      const login = await testDb.db
        .selectFrom('logins')
        .select('stats')
        .where('login_name', '=', loginName)
        .executeTakeFirstOrThrow();
      expect(login.stats).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('rejects an oversized array (stats must be exactly 7 elements)', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/update',
        ...authed({ payload: { name: loginName, stats: [1, 2, 3] } }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('slayer-task-completed / clue-completed / death', () => {
    it('records a slayer task completion', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/slayer-task-completed',
        ...authed({ payload: { name: loginName, task: 'Gargoyles', master: 'Duradel', amount_completed: 130, outcome: 'completed' } }),
      });
      expect(res.statusCode).toBe(201);
    });

    it('records a clue completion', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/clue-completed',
        ...authed({ payload: { name: loginName, tier: 'easy' } }),
      });
      expect(res.statusCode).toBe(201);
    });

    it('records a death with optional fields present', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/death',
        ...authed({ payload: { name: loginName, world_x: 3200, world_y: 3200, plane: 0, killer: 'Gargoyle' } }),
      });
      expect(res.statusCode).toBe(201);
    });

    it('records a death with all optional fields absent', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/death',
        ...authed({ payload: { name: loginName } }),
      });
      expect(res.statusCode).toBe(201);
    });
  });

  it("get-data returns the login's own snapshot", async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/get-data?from_time=1970-01-01T00:00:00.000Z',
      ...authed(),
    });
    expect(res.statusCode).toBe(200);
    const snapshot = res.json();
    expect(snapshot.name).toBe(loginName);
  });

  it.each(['Day', 'Week', 'Month', 'Year'])('get-skill-data accepts period=%s', async (period) => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/get-skill-data?period=${period}`,
      ...authed(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('get-skill-data rejects an invalid period', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/get-skill-data?period=Century',
      ...authed(),
    });
    expect(res.statusCode).toBe(400);
  });
});
