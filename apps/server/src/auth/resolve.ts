import type { Kysely } from 'kysely';
import { getGroupIdByToken, type Database } from '../db/index.js';
import type { AuthenticationCache } from './cache.js';
import { tokenHash } from './token-hash.js';

export interface AuthDeps {
  db: Kysely<Database>;
  cache: AuthenticationCache;
  secret: string;
}

/** Cache-first group resolution shared by the REST and MCP auth preHandlers. */
export async function resolveGroupId(deps: AuthDeps, groupName: string, token: string): Promise<string | undefined> {
  const hash = tokenHash(token, groupName, deps.secret);

  const cached = deps.cache.get(groupName, hash);
  if (cached !== undefined) return cached;

  const groupId = await getGroupIdByToken(deps.db, groupName, hash);
  if (groupId !== undefined) {
    deps.cache.insert(groupName, hash, groupId);
  }
  return groupId;
}
