import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tokenHash } from '../src/auth/index.js';
import { createGroup } from '../src/db/groups.js';
import { buildTestApp, closeTestApp, TEST_SECRET, type TestApp } from './helpers/test-app.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('authed routes', () => {
  let testDb: TestDb;
  let testApp: TestApp;
  const groupName = 'authedroutes';
  const token = 'the-token';

  beforeAll(async () => {
    testDb = await startTestDb();
    await createGroup(testDb.db, {
      name: groupName,
      memberNames: ['alice', 'bob', 'carol', 'dave', 'erin'],
      tokenHash: tokenHash(token, groupName, TEST_SECRET),
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
    const res = await testApp.app.inject({ method: 'GET', url: `/api/group/${groupName}/am-i-logged-in` });
    expect(res.statusCode).toBe(400);
  });

  it('am-i-logged-in returns 200 for a valid token', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: `/api/group/${groupName}/am-i-logged-in`, ...authed() });
    expect(res.statusCode).toBe(200);
  });

  it('am-i-in-group: 200 for a real member, 401 for a non-member', async () => {
    const realMember = await testApp.app.inject({
      method: 'GET',
      url: `/api/group/${groupName}/am-i-in-group?member_name=alice`,
      ...authed(),
    });
    expect(realMember.statusCode).toBe(200);

    const nonMember = await testApp.app.inject({
      method: 'GET',
      url: `/api/group/${groupName}/am-i-in-group?member_name=nobody`,
      ...authed(),
    });
    expect(nonMember.statusCode).toBe(401);
  });

  describe('add/delete/rename group member', () => {
    it('adds a new member', async () => {
      await createGroup(testDb.db, { name: 'addmembertest', memberNames: [], tokenHash: tokenHash('t', 'addmembertest', TEST_SECRET) });
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/group/addmembertest/add-group-member',
        headers: { authorization: 't' },
        payload: { name: 'freshmember' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects adding the @SHARED member name', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/add-group-member`,
        ...authed({ payload: { name: '@SHARED' } }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects adding a 6th member (group full)', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/add-group-member`,
        ...authed({ payload: { name: 'sixthmember' } }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('deletes a member and is a no-op for an unknown name', async () => {
      await createGroup(testDb.db, { name: 'delmembertest', memberNames: ['toremove'], tokenHash: tokenHash('t', 'delmembertest', TEST_SECRET) });
      const res = await testApp.app.inject({
        method: 'DELETE',
        url: '/api/group/delmembertest/delete-group-member',
        headers: { authorization: 't' },
        payload: { name: 'toremove' },
      });
      expect(res.statusCode).toBe(200);

      const noop = await testApp.app.inject({
        method: 'DELETE',
        url: '/api/group/delmembertest/delete-group-member',
        headers: { authorization: 't' },
        payload: { name: 'never-existed' },
      });
      expect(noop.statusCode).toBe(200);
    });

    it('renames a member and rejects an invalid new name', async () => {
      await createGroup(testDb.db, { name: 'renametest', memberNames: ['before'], tokenHash: tokenHash('t', 'renametest', TEST_SECRET) });
      const ok = await testApp.app.inject({
        method: 'PUT',
        url: '/api/group/renametest/rename-group-member',
        headers: { authorization: 't' },
        payload: { original_name: 'before', new_name: 'after' },
      });
      expect(ok.statusCode).toBe(200);

      const bad = await testApp.app.inject({
        method: 'PUT',
        url: '/api/group/renametest/rename-group-member',
        headers: { authorization: 't' },
        payload: { original_name: 'after', new_name: 'not valid!!' },
      });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe('update-group-member', () => {
    it('accepts a partial update and eventually persists it via the batcher', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/update-group-member`,
        ...authed({ payload: { name: 'alice', stats: [1, 2, 3, 4, 5, 6, 7] } }),
      });
      expect(res.statusCode).toBe(200);

      await testApp.batcher.flush();
      const alice = await testDb.db
        .selectFrom('members')
        .select('stats')
        .where('group_id', '=', (await testDb.db.selectFrom('groups').select('group_id').where('group_name', '=', groupName).executeTakeFirstOrThrow()).group_id)
        .where('member_name', '=', 'alice')
        .executeTakeFirstOrThrow();
      expect(alice.stats).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('rejects an oversized array (stats must be exactly 7 elements)', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/update-group-member`,
        ...authed({ payload: { name: 'alice', stats: [1, 2, 3] } }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects @SHARED as an update target', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/update-group-member`,
        ...authed({ payload: { name: '@SHARED', stats: [1, 2, 3, 4, 5, 6, 7] } }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('slayer-task-completed / clue-completed / death', () => {
    it('records a slayer task completion', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/slayer-task-completed`,
        ...authed({ payload: { name: 'bob', task: 'Gargoyles', master: 'Duradel', amount_completed: 130, outcome: 'completed' } }),
      });
      expect(res.statusCode).toBe(201);
    });

    it('rejects a slayer completion for @SHARED', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/slayer-task-completed`,
        ...authed({ payload: { name: '@SHARED', task: 'x', amount_completed: 1, outcome: 'completed' } }),
      });
      expect(res.statusCode).toBe(400);
    });

    it('records a clue completion', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/clue-completed`,
        ...authed({ payload: { name: 'carol', tier: 'easy' } }),
      });
      expect(res.statusCode).toBe(201);
    });

    it('records a death with optional fields present', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/death`,
        ...authed({ payload: { name: 'dave', world_x: 3200, world_y: 3200, plane: 0, killer: 'Gargoyle' } }),
      });
      expect(res.statusCode).toBe(201);
    });

    it('records a death with all optional fields absent', async () => {
      const res = await testApp.app.inject({
        method: 'POST',
        url: `/api/group/${groupName}/death`,
        ...authed({ payload: { name: 'erin' } }),
      });
      expect(res.statusCode).toBe(201);
    });
  });

  it('get-group-data returns the group members', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/group/${groupName}/get-group-data?from_time=1970-01-01T00:00:00.000Z`,
      ...authed(),
    });
    expect(res.statusCode).toBe(200);
    const members = res.json();
    expect(Array.isArray(members)).toBe(true);
    expect(members.some((m: { name: string }) => m.name === 'alice')).toBe(true);
  });

  it.each(['Day', 'Week', 'Month', 'Year'])('get-skill-data accepts period=%s', async (period) => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/group/${groupName}/get-skill-data?period=${period}`,
      ...authed(),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('get-skill-data rejects an invalid period', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/group/${groupName}/get-skill-data?period=Century`,
      ...authed(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('collection-log legacy stub always returns an empty object', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: `/api/group/${groupName}/collection-log`, ...authed() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});
  });
});
