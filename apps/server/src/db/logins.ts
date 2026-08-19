import type { Kysely } from 'kysely';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import type { Database } from './types.js';

export const CURRENT_LOGIN_VERSION = 2;
export const MAX_MEMBERS_PER_LOGIN = 5;

export class LoginFullError extends Error {
  constructor() {
    super('Login has already reached the maximum amount of players');
    this.name = 'LoginFullError';
  }
}

export interface CreateLoginInput {
  name: string;
  memberNames: string[];
  tokenHash: string;
}

export async function createLogin(db: Kysely<Database>, input: CreateLoginInput): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const login = await trx
      .insertInto('logins')
      .values({ login_name: input.name, token_hash: input.tokenHash, version: CURRENT_LOGIN_VERSION })
      .returning('login_id')
      .executeTakeFirstOrThrow();

    const memberRows = [SHARED_MEMBER, ...input.memberNames].map((member_name) => ({
      login_id: login.login_id,
      member_name,
    }));
    await trx.insertInto('members').values(memberRows).execute();
  });
}

export async function addMember(db: Kysely<Database>, loginId: string, memberName: string): Promise<void> {
  const { count } = await db
    .selectFrom('members')
    .select(({ fn }) => fn.countAll<string>().as('count'))
    .where('login_id', '=', loginId)
    .where('member_name', '!=', SHARED_MEMBER)
    .executeTakeFirstOrThrow();

  if (Number(count) >= MAX_MEMBERS_PER_LOGIN) {
    throw new LoginFullError();
  }

  await db.insertInto('members').values({ login_id: loginId, member_name: memberName }).execute();
}

/** No-op (not an error) if the member doesn't exist, matching the prior Rust behavior. */
export async function deleteMember(db: Kysely<Database>, loginId: string, memberName: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const member = await trx
      .selectFrom('members')
      .select('member_id')
      .where('login_id', '=', loginId)
      .where('member_name', '=', memberName)
      .executeTakeFirst();

    if (!member) return;

    await trx.deleteFrom('skills_day').where('member_id', '=', member.member_id).execute();
    await trx.deleteFrom('skills_month').where('member_id', '=', member.member_id).execute();
    await trx.deleteFrom('skills_year').where('member_id', '=', member.member_id).execute();
    await trx.deleteFrom('members').where('member_id', '=', member.member_id).execute();
  });
}

export async function renameMember(
  db: Kysely<Database>,
  loginId: string,
  originalName: string,
  newName: string,
): Promise<void> {
  await db
    .updateTable('members')
    .set({ member_name: newName })
    .where('login_id', '=', loginId)
    .where('member_name', '=', originalName)
    .execute();
}

export async function getMemberId(
  db: Kysely<Database>,
  loginId: string,
  memberName: string,
): Promise<string | undefined> {
  const row = await db
    .selectFrom('members')
    .select('member_id')
    .where('login_id', '=', loginId)
    .where('member_name', '=', memberName)
    .executeTakeFirst();
  return row?.member_id;
}

export async function isMemberPresent(db: Kysely<Database>, loginId: string, memberName: string): Promise<boolean> {
  return (await getMemberId(db, loginId, memberName)) !== undefined;
}

/** Auth lookup: resolves a login id from a login name + already-hashed token. */
export async function getLoginIdByToken(
  db: Kysely<Database>,
  loginName: string,
  tokenHash: string,
): Promise<string | undefined> {
  const row = await db
    .selectFrom('logins')
    .select('login_id')
    .where('login_name', '=', loginName)
    .where('token_hash', '=', tokenHash)
    .executeTakeFirst();
  return row?.login_id;
}

export interface MemberSummary {
  name: string;
  accountType: string | null;
}

/** Excludes the synthetic `@SHARED` member. */
export async function listMembers(db: Kysely<Database>, loginId: string): Promise<MemberSummary[]> {
  const rows = await db
    .selectFrom('members')
    .select(['member_name', 'account_type'])
    .where('login_id', '=', loginId)
    .where('member_name', '!=', SHARED_MEMBER)
    .execute();
  return rows.map((r) => ({ name: r.member_name, accountType: r.account_type }));
}

export interface MemberRef {
  memberId: string;
  memberName: string;
}

/** Across every login - used only by the hiscores poller. Excludes `@SHARED`. */
export async function listAllMembers(db: Kysely<Database>): Promise<MemberRef[]> {
  const rows = await db
    .selectFrom('members')
    .select(['member_id', 'member_name'])
    .where('member_name', '!=', SHARED_MEMBER)
    .execute();
  return rows.map((r) => ({ memberId: r.member_id, memberName: r.member_name }));
}
