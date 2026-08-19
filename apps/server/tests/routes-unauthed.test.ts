import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, closeTestApp, type TestApp } from './helpers/test-app.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('unauthed routes', () => {
  let testDb: TestDb;
  let testApp: TestApp;

  beforeAll(async () => {
    testDb = await startTestDb();
    testApp = await buildTestApp(testDb);
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(testApp);
    await stopTestDb(testDb);
  });

  it('creates a login and returns a generated token', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/create-login',
      payload: { login_name: 'newlogin', member_names: ['alice', 'bob'] },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.login_name).toBe('newlogin');
    expect(body.member_names).toEqual(['alice', 'bob']);
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  it('allows a solo (1-member) login', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/create-login',
      payload: { login_name: 'soloiron', member_names: ['justme'] },
    });
    expect(res.statusCode).toBe(201);
  });

  it('filters blank member names', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/create-login',
      payload: { login_name: 'paddedlogin', member_names: ['alice', '', '  ', 'bob', ''] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().member_names).toEqual(['alice', 'bob']);
  });

  it('rejects more than 5 members', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/create-login',
      payload: { login_name: 'toobig', member_names: ['a', 'b', 'c', 'd', 'e', 'f'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid login name', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/create-login',
      payload: { login_name: 'not valid!!', member_names: ['alice'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an invalid member name', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/create-login',
      payload: { login_name: 'validlogin', member_names: ['not valid!!'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('reports captcha-enabled reflecting config (disabled by default in tests)', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/captcha-enabled' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: false, sitekey: '' });
  });

  it('serves ge-prices as JSON with a long cache-control header', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/api/ge-prices' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('reports healthy on /health', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});
