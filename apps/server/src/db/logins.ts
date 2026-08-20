import type { Kysely } from 'kysely';
import type { Database } from './types.js';

export const CURRENT_LOGIN_VERSION = 2;

export interface CreateLoginInput {
  name: string;
  tokenHash: string;
}

export async function createLogin(db: Kysely<Database>, input: CreateLoginInput): Promise<void> {
  await db
    .insertInto('logins')
    .values({ login_name: input.name, token_hash: input.tokenHash, version: CURRENT_LOGIN_VERSION })
    .execute();
}

export async function renameLogin(db: Kysely<Database>, loginId: string, newName: string): Promise<void> {
  await db.updateTable('logins').set({ login_name: newName }).where('login_id', '=', loginId).execute();
}

export interface LoginByToken {
  loginId: string;
  loginName: string;
}

/** Auth lookup: resolves a login purely from an already-hashed token. */
export async function getLoginByTokenHash(db: Kysely<Database>, tokenHash: string): Promise<LoginByToken | undefined> {
  const row = await db
    .selectFrom('logins')
    .select(['login_id', 'login_name'])
    .where('token_hash', '=', tokenHash)
    .executeTakeFirst();
  return row ? { loginId: row.login_id, loginName: row.login_name } : undefined;
}

export interface LoginRef {
  loginId: string;
  loginName: string;
}

/** Every login - used only by the hiscores poller. */
export async function listAllLogins(db: Kysely<Database>): Promise<LoginRef[]> {
  const rows = await db.selectFrom('logins').select(['login_id', 'login_name']).execute();
  return rows.map((r) => ({ loginId: r.login_id, loginName: r.login_name }));
}
