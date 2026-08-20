import type { FastifyBaseLogger } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { listAllLogins } from '../db/logins.js';
import { aggregateSkills, applySkillsRetention } from '../db/skills.js';
import { fetchGePrices } from './ge-prices.js';
import { syncLoginHiscores } from './hiscores.js';
import { syncItemMetadata } from './item-metadata.js';
import { setGePrices } from '../routes/ge-price-cache.js';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const GE_UPDATE_INTERVAL_MS = 4 * HOUR_MS;
export const SKILLS_AGGREGATION_INTERVAL_MS = 30 * MINUTE_MS;
export const HISCORES_POLL_INTERVAL_MS = 20 * MINUTE_MS;
export const ITEM_METADATA_SYNC_INTERVAL_MS = 7 * DAY_MS;

export interface JobHandle {
  stop(): void;
}

/** Runs `task` immediately, then every `intervalMs`; a failed run is logged, never fatal. */
function runIntervalJob(logger: FastifyBaseLogger, name: string, task: () => Promise<void>, intervalMs: number): JobHandle {
  const runSafely = (): void => {
    task().catch((error: unknown) => logger.error({ err: error, job: name }, `${name} failed`));
  };

  runSafely();
  const interval = setInterval(runSafely, intervalMs);
  return { stop: () => clearInterval(interval) };
}

export function startGeUpdater(logger: FastifyBaseLogger): JobHandle {
  return runIntervalJob(
    logger,
    'ge-price-updater',
    async () => {
      const prices = await fetchGePrices();
      setGePrices(prices);
    },
    GE_UPDATE_INTERVAL_MS,
  );
}

export function startSkillsAggregator(logger: FastifyBaseLogger, db: Kysely<Database>): JobHandle {
  return runIntervalJob(
    logger,
    'skills-aggregator',
    async () => {
      await aggregateSkills(db);
      await applySkillsRetention(db);
    },
    SKILLS_AGGREGATION_INTERVAL_MS,
  );
}

export function startHiscoresPoller(logger: FastifyBaseLogger, db: Kysely<Database>): JobHandle {
  return runIntervalJob(
    logger,
    'hiscores-poller',
    async () => {
      const logins = await listAllLogins(db);
      for (const login of logins) {
        try {
          const synced = await syncLoginHiscores(db, login);
          if (!synced) {
            logger.warn({ login: login.loginName }, 'login not found on any Hiscores board this cycle');
          }
        } catch (error) {
          logger.error({ err: error, login: login.loginName }, 'hiscores sync failed for login');
        }
      }
    },
    HISCORES_POLL_INTERVAL_MS,
  );
}

export function startItemMetadataSync(logger: FastifyBaseLogger, db: Kysely<Database>): JobHandle {
  return runIntervalJob(logger, 'item-metadata-sync', () => syncItemMetadata(db), ITEM_METADATA_SYNC_INTERVAL_MS);
}

export function startAllJobs(logger: FastifyBaseLogger, db: Kysely<Database>): JobHandle {
  const handles = [
    startGeUpdater(logger),
    startSkillsAggregator(logger, db),
    startHiscoresPoller(logger, db),
    startItemMetadataSync(logger, db),
  ];
  return { stop: () => handles.forEach((h) => h.stop()) };
}
