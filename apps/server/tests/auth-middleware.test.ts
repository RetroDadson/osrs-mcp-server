import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthenticationCache, createMcpAuthPreHandler, createRestAuthPreHandler, tokenHash } from '../src/auth/index.js';
import { createGroup } from '../src/db/groups.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

const SECRET = 'integration-test-secret';

describe('auth preHandlers', () => {
  let testDb: TestDb;
  let app: FastifyInstance;
  const groupName = 'authmwtest';
  const rawToken = 'the-real-token';

  beforeAll(async () => {
    testDb = await startTestDb();
    await createGroup(testDb.db, {
      name: groupName,
      memberNames: ['alice'],
      tokenHash: tokenHash(rawToken, groupName, SECRET),
    });

    const deps = { db: testDb.db, cache: new AuthenticationCache(), secret: SECRET };
    app = Fastify();
    app.get(
      '/api/group/:groupName/ping',
      { preHandler: createRestAuthPreHandler(deps) },
      async (request) => ({ groupId: request.groupId }),
    );
    app.get(
      '/mcp/:groupName',
      { preHandler: createMcpAuthPreHandler(deps) },
      async (request) => ({ groupId: request.groupId }),
    );
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await stopTestDb(testDb);
  });

  it('REST: 400 on a missing Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/group/${groupName}/ping` });
    expect(res.statusCode).toBe(400);
  });

  it('REST: 401 on a wrong token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/group/${groupName}/ping`,
      headers: { authorization: 'wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('REST: 200 with the correct token, and injects groupId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/group/${groupName}/ping`,
      headers: { authorization: rawToken },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().groupId).toBeDefined();
  });

  it('REST: 401 when the correct token is presented for the wrong group name', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/group/some-other-group/ping`,
      headers: { authorization: rawToken },
    });
    expect(res.statusCode).toBe(401);
  });

  it('MCP: 401 (not 400) on a missing Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: `/mcp/${groupName}` });
    expect(res.statusCode).toBe(401);
  });

  it('MCP: 401 on a wrong token', async () => {
    const res = await app.inject({ method: 'GET', url: `/mcp/${groupName}`, headers: { authorization: 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('MCP: 200 with the correct token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/mcp/${groupName}`,
      headers: { authorization: rawToken },
    });
    expect(res.statusCode).toBe(200);
  });
});
