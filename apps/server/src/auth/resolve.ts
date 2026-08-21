import type { Kysely } from 'kysely';
import { getLoginByTokenHash, type Database } from '../db/index.js';
import type { AuthenticationCache, CachedLogin } from './cache.js';
import { tokenHash } from './token-hash.js';

export interface AuthDeps {
  db: Kysely<Database>;
  cache: AuthenticationCache;
  secret: string;
}

/** Cache-first login resolution shared by the REST and MCP auth preHandlers. */
export async function resolveLogin(deps: AuthDeps, token: string): Promise<CachedLogin | undefined> {
  const hash = tokenHash(token, deps.secret);

  const cached = deps.cache.get(hash);
  if (cached !== undefined) return cached;

  const login = await getLoginByTokenHash(deps.db, hash);
  if (login !== undefined) {
    deps.cache.insert(hash, login.loginId, login.loginName);
  }
  return login;
}
