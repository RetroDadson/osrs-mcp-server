import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { deduplicateBatch } from './merge.js';
import { executeBulkUpdate, processBankSideEffects } from './sql.js';
import type { PendingUpdate } from './types.js';

export const BATCH_SIZE = 5000;
export const CHUNK_SIZE = 50;
export const BATCH_TIMEOUT_MS = 50;

export interface BatcherHandle {
  enqueue(update: PendingUpdate): void;
  /** Forces immediate processing of whatever's currently buffered; resolves once written. */
  flush(): Promise<void>;
  stop(): Promise<void>;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function processBatch(db: Kysely<Database>, buffer: readonly PendingUpdate[]): Promise<void> {
  const deduped = deduplicateBatch([...buffer]);
  const chunks = chunk(deduped, CHUNK_SIZE);

  await Promise.all(
    chunks.map(async (batchChunk) => {
      await executeBulkUpdate(db, batchChunk);
      await processBankSideEffects(db, batchChunk);
    }),
  );
}

/**
 * Time-windowed micro-batcher: accumulates `update` writes for up to
 * `BATCH_TIMEOUT_MS` (50ms) or until `BATCH_SIZE` (5000) items, whichever comes first, then
 * writes the whole batch in one pass (deduped, chunked, bulk-UPDATEd). `enqueue` never blocks on
 * the DB - callers get a fire-and-forget write, matching the REST route's immediate-200 contract.
 */
export function startBatcher(db: Kysely<Database>): BatcherHandle {
  let buffer: PendingUpdate[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Promise<void> = Promise.resolve();

  function triggerFlush(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    pending = pending.then(() => processBatch(db, batch));
  }

  return {
    enqueue(update) {
      buffer.push(update);
      if (buffer.length >= BATCH_SIZE) {
        triggerFlush();
      } else if (!timer) {
        timer = setTimeout(triggerFlush, BATCH_TIMEOUT_MS);
      }
    },
    async flush() {
      triggerFlush();
      await pending;
    },
    async stop() {
      triggerFlush();
      await pending;
    },
  };
}
