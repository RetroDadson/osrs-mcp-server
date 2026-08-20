import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthenticationCache, createMcpAuthPreHandler, createRestAuthPreHandler, tokenHash } from '../src/auth/index.js';
import { createLogin } from '../src/db/logins.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

const SECRET = 'integration-test-secret';

describe('auth preHandlers', () => {
  let testDb: TestDb;
  let app: FastifyInstance;
  const loginName = 'authmwtest';
  const rawToken = 'the-real-token';

  beforeAll(async () => {
    testDb = await startTestDb();
    await createLogin(testDb.db, {
      name: loginName,
      tokenHash: tokenHash(rawToken, SECRET),
    });

    const deps = { db: testDb.db, cache: new AuthenticationCache(), secret: SECRET };
    app = Fastify();
    app.get('/api/ping', { preHandler: createRestAuthPreHandler(deps) }, async (request) => ({
      loginId: request.loginId,
      loginName: request.loginName,
    }));
    app.get('/mcp', { preHandler: createMcpAuthPreHandler(deps) }, async (request) => ({
      loginId: request.loginId,
      loginName: request.loginName,
    }));
    await app.ready();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await stopTestDb(testDb);
  });

  it('REST: 400 on a missing Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ping' });
    expect(res.statusCode).toBe(400);
  });

  it('REST: 401 on a wrong token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ping',
      headers: { authorization: 'wrong-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('REST: 200 with the correct token, and injects loginId/loginName', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/ping',
      headers: { authorization: rawToken },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().loginId).toBeDefined();
    expect(res.json().loginName).toBe(loginName);
  });

  it('MCP: 401 (not 400) on a missing Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/mcp' });
    expect(res.statusCode).toBe(401);
  });

  it('MCP: 401 on a wrong token', async () => {
    const res = await app.inject({ method: 'GET', url: '/mcp', headers: { authorization: 'nope' } });
    expect(res.statusCode).toBe(401);
  });

  it('MCP: 200 with the correct token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/mcp',
      headers: { authorization: rawToken },
    });
    expect(res.statusCode).toBe(200);
  });
});
