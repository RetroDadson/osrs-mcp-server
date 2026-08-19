import { defineConfig, devices } from '@playwright/test';
import { E2E_SERVER_PORT } from './tests/e2e/global-setup.js';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  retries: 0,
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { BACKEND_PORT: String(E2E_SERVER_PORT) },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
