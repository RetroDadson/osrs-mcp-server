import type { Kysely } from 'kysely';
import { getLoginIdByToken, type Database } from '../db/index.js';
import type { AuthenticationCache } from './cache.js';
import { tokenHash } from './token-hash.js';

export interface AuthDeps {
  db: Kysely<Database>;
  cache: AuthenticationCache;
  secret: string;
}

/** Cache-first login resolution shared by the REST and MCP auth preHandlers. */
export async function resolveLoginId(deps: AuthDeps, loginName: string, token: string): Promise<string | undefined> {
  const hash = tokenHash(token, loginName, deps.secret);

  const cached = deps.cache.get(loginName, hash);
  if (cached !== undefined) return cached;

  const loginId = await getLoginIdByToken(deps.db, loginName, hash);
  if (loginId !== undefined) {
    deps.cache.insert(loginName, hash, loginId);
  }
  return loginId;
}
