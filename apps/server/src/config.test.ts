import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const ENV_KEYS = [
  'TEST_DATABASE_URL',
  'DATABASE_URL',
  'PG_HOST',
  'PG_PORT',
  'PG_USER',
  'PG_PASSWORD',
  'PG_DB',
  'AUTH_SECRET',
  'PORT',
  'LOG_LEVEL',
  'HCAPTCHA_ENABLED',
  'HCAPTCHA_SITEKEY',
  'HCAPTCHA_SECRET',
] as const;

describe('loadConfig', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('prefers TEST_DATABASE_URL over everything else', () => {
    process.env.TEST_DATABASE_URL = 'postgres://test-url';
    process.env.DATABASE_URL = 'postgres://should-not-be-used';
    process.env.AUTH_SECRET = 'secret';
    expect(loadConfig().databaseUrl).toBe('postgres://test-url');
  });

  it('falls back to DATABASE_URL when TEST_DATABASE_URL is absent', () => {
    process.env.DATABASE_URL = 'postgres://explicit-url';
    process.env.AUTH_SECRET = 'secret';
    expect(loadConfig().databaseUrl).toBe('postgres://explicit-url');
  });

  it('builds a connection string from discrete PG_* vars as the last resort, defaulting host/port', () => {
    process.env.PG_USER = 'u';
    process.env.PG_PASSWORD = 'p';
    process.env.PG_DB = 'd';
    process.env.AUTH_SECRET = 'secret';
    expect(loadConfig().databaseUrl).toBe('postgres://u:p@localhost:5432/d');
  });

  it('throws when AUTH_SECRET is missing', () => {
    process.env.PG_USER = 'u';
    process.env.PG_PASSWORD = 'p';
    process.env.PG_DB = 'd';
    expect(() => loadConfig()).toThrow(/AUTH_SECRET/);
  });

  it('defaults port to 8080, logLevel to info, and hcaptcha to disabled', () => {
    process.env.AUTH_SECRET = 'secret';
    process.env.PG_USER = 'u';
    process.env.PG_PASSWORD = 'p';
    process.env.PG_DB = 'd';
    const config = loadConfig();
    expect(config.port).toBe(8080);
    expect(config.logLevel).toBe('info');
    expect(config.hcaptcha).toEqual({ enabled: false, sitekey: '', secret: '' });
  });

  it('reads PORT, LOG_LEVEL, and hcaptcha settings when present', () => {
    process.env.AUTH_SECRET = 'secret';
    process.env.TEST_DATABASE_URL = 'postgres://x';
    process.env.PORT = '9000';
    process.env.LOG_LEVEL = 'warn';
    process.env.HCAPTCHA_ENABLED = 'true';
    process.env.HCAPTCHA_SITEKEY = 'site123';
    process.env.HCAPTCHA_SECRET = 'secret123';

    const config = loadConfig();
    expect(config.port).toBe(9000);
    expect(config.logLevel).toBe('warn');
    expect(config.hcaptcha).toEqual({ enabled: true, sitekey: 'site123', secret: 'secret123' });
  });
});
