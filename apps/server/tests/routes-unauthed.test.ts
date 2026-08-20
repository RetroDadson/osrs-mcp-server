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
      payload: { login_name: 'newlogin' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.login_name).toBe('newlogin');
    expect(typeof body.token).toBe('string');
    expect(body.token.length).toBeGreaterThan(0);
  });

  it('rejects an invalid login name', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/create-login',
      payload: { login_name: 'not valid!!' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a request body with unknown fields (e.g. a leftover member_names array)', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/create-login',
      payload: { login_name: 'strictlogin', member_names: ['alice'] },
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
