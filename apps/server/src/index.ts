import { buildApp } from './app.js';
import { AuthenticationCache } from './auth/index.js';
import { startBatcher } from './batcher/index.js';
import { loadConfig } from './config.js';
import { createDb, createPool, createRawDb, migrateToLatest } from './db/index.js';
import { startAllJobs } from './jobs/index.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);

  await migrateToLatest(createRawDb(pool) as never);

  const db = createDb(pool);
  const batcher = startBatcher(db);
  const authCache = new AuthenticationCache();

  const app = await buildApp({ db, config, authCache, batcher });

  const jobs = startAllJobs(app.log, db);

  const shutdown = async (): Promise<void> => {
    jobs.stop();
    await batcher.stop();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
