import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';

/** Bound per-session at connection time (the `/mcp/:loginName` auth preHandler already resolved
 * `loginId` once for the whole HTTP session) - every tool closure captures this directly, no
 * per-call auth-context extraction needed. */
export interface ToolContext {
  db: Kysely<Database>;
  loginId: string;
}
