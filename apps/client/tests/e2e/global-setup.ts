import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const E2E_SERVER_PORT = 8099;
const AUTH_SECRET = 'e2e-test-secret';

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet, keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms`);
}

/**
 * Starts a real testcontainers Postgres and the real apps/server process (via tsx, no build step
 * needed for e2e) before Playwright's webServer (the Vite dev server, proxying /api to this
 * backend) comes up. Playwright uses this function's own return value as the teardown.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();

  const serverEntry = path.resolve(__dirname, '../../../server/src/index.ts');
  const serverProcess = spawn(process.execPath, ['--import', 'tsx', serverEntry], {
    env: {
      ...process.env,
      DATABASE_URL: container.getConnectionUri(),
      AUTH_SECRET,
      PORT: String(E2E_SERVER_PORT),
      LOG_LEVEL: 'error',
    },
    stdio: 'inherit',
  });

  await waitForHealth(`http://127.0.0.1:${E2E_SERVER_PORT}/health`, 30_000);

  return async () => {
    serverProcess.kill();
    await container.stop();
  };
}
