import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { AuthenticationCache } from '../../src/auth/index.js';
import { startBatcher, type BatcherHandle } from '../../src/batcher/index.js';
import type { AppConfig } from '../../src/config.js';
import type { TestDb } from './test-db.js';

export const TEST_SECRET = 'integration-test-secret';

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    logLevel: 'error',
    databaseUrl: '',
    authSecret: TEST_SECRET,
    hcaptcha: { enabled: false, sitekey: '', secret: '' },
    ...overrides,
  };
}

export interface TestApp {
  app: FastifyInstance;
  batcher: BatcherHandle;
  config: AppConfig;
}

export async function buildTestApp(testDb: TestDb, configOverrides: Partial<AppConfig> = {}): Promise<TestApp> {
  const config = testConfig(configOverrides);
  const batcher = startBatcher(testDb.db);
  const app = await buildApp({ db: testDb.db, config, authCache: new AuthenticationCache(), batcher });
  await app.ready();
  return { app, batcher, config };
}

export async function closeTestApp(testApp: TestApp): Promise<void> {
  await testApp.batcher.stop();
  await testApp.app.close();
}
