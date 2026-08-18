export interface AppConfig {
  port: number;
  logLevel: 'info' | 'warn' | 'error' | 'debug';
  databaseUrl: string;
  authSecret: string;
  hcaptcha: {
    enabled: boolean;
    sitekey: string;
    secret: string;
  };
}

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * `DATABASE_URL` (or `TEST_DATABASE_URL`, checked first so integration tests can point at a
 * throwaway testcontainers instance without touching the rest of config) wins outright; otherwise
 * a connection string is built from the discrete PG_* vars.
 */
function resolveDatabaseUrl(): string {
  const testUrl = env('TEST_DATABASE_URL');
  if (testUrl) return testUrl;

  const explicit = env('DATABASE_URL');
  if (explicit) return explicit;

  const host = env('PG_HOST') ?? 'localhost';
  const port = env('PG_PORT') ?? '5432';
  const user = requireEnv('PG_USER');
  const password = requireEnv('PG_PASSWORD');
  const dbName = requireEnv('PG_DB');
  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(env('PORT') ?? '8080'),
    logLevel: (env('LOG_LEVEL') as AppConfig['logLevel']) ?? 'info',
    databaseUrl: resolveDatabaseUrl(),
    authSecret: requireEnv('AUTH_SECRET'),
    hcaptcha: {
      enabled: (env('HCAPTCHA_ENABLED') ?? 'false').toLowerCase() === 'true',
      sitekey: env('HCAPTCHA_SITEKEY') ?? '',
      secret: env('HCAPTCHA_SECRET') ?? '',
    },
  };
}
