import type { Kysely } from 'kysely';
import type { BatcherHandle } from '../batcher/index.js';
import type { AppConfig } from '../config.js';
import type { Database } from '../db/types.js';
import type { AuthenticationCache } from '../auth/index.js';

export interface RouteDeps {
  db: Kysely<Database>;
  config: AppConfig;
  authCache: AuthenticationCache;
  batcher: BatcherHandle;
}
