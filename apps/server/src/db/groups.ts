import type { Kysely } from 'kysely';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import type { Database } from './types.js';

export const CURRENT_GROUP_VERSION = 2;
export const MAX_MEMBERS_PER_GROUP = 5;

export class GroupFullError extends Error {
  constructor() {
    super('Group has already reached the maximum amount of players');
    this.name = 'GroupFullError';
  }
}

export interface CreateGroupInput {
  name: string;
  memberNames: string[];
  tokenHash: string;
}

export async function createGroup(db: Kysely<Database>, input: CreateGroupInput): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const group = await trx
      .insertInto('groups')
      .values({ group_name: input.name, group_token_hash: input.tokenHash, version: CURRENT_GROUP_VERSION })
      .returning('group_id')
      .executeTakeFirstOrThrow();

    const memberRows = [SHARED_MEMBER, ...input.memberNames].map((member_name) => ({
      group_id: group.group_id,
      member_name,
    }));
    await trx.insertInto('members').values(memberRows).execute();
  });
}

export async function addGroupMember(db: Kysely<Database>, groupId: string, memberName: string): Promise<void> {
  const { count } = await db
    .selectFrom('members')
    .select(({ fn }) => fn.countAll<string>().as('count'))
    .where('group_id', '=', groupId)
    .where('member_name', '!=', SHARED_MEMBER)
    .executeTakeFirstOrThrow();

  if (Number(count) >= MAX_MEMBERS_PER_GROUP) {
    throw new GroupFullError();
  }

  await db.insertInto('members').values({ group_id: groupId, member_name: memberName }).execute();
}

/** No-op (not an error) if the member doesn't exist, matching the prior Rust behavior. */
export async function deleteGroupMember(db: Kysely<Database>, groupId: string, memberName: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const member = await trx
      .selectFrom('members')
      .select('member_id')
      .where('group_id', '=', groupId)
      .where('member_name', '=', memberName)
      .executeTakeFirst();

    if (!member) return;

    await trx.deleteFrom('skills_day').where('member_id', '=', member.member_id).execute();
    await trx.deleteFrom('skills_month').where('member_id', '=', member.member_id).execute();
    await trx.deleteFrom('skills_year').where('member_id', '=', member.member_id).execute();
    await trx.deleteFrom('members').where('member_id', '=', member.member_id).execute();
  });
}

export async function renameGroupMember(
  db: Kysely<Database>,
  groupId: string,
  originalName: string,
  newName: string,
): Promise<void> {
  await db
    .updateTable('members')
    .set({ member_name: newName })
    .where('group_id', '=', groupId)
    .where('member_name', '=', originalName)
    .execute();
}

export async function getMemberId(
  db: Kysely<Database>,
  groupId: string,
  memberName: string,
): Promise<string | undefined> {
  const row = await db
    .selectFrom('members')
    .select('member_id')
    .where('group_id', '=', groupId)
    .where('member_name', '=', memberName)
    .executeTakeFirst();
  return row?.member_id;
}

export async function isMemberInGroup(db: Kysely<Database>, groupId: string, memberName: string): Promise<boolean> {
  return (await getMemberId(db, groupId, memberName)) !== undefined;
}

/** Auth lookup: resolves a group id from a group name + already-hashed token. */
export async function getGroupIdByToken(
  db: Kysely<Database>,
  groupName: string,
  tokenHash: string,
): Promise<string | undefined> {
  const row = await db
    .selectFrom('groups')
    .select('group_id')
    .where('group_name', '=', groupName)
    .where('group_token_hash', '=', tokenHash)
    .executeTakeFirst();
  return row?.group_id;
}

export interface GroupMemberRef {
  name: string;
  accountType: string | null;
}

/** Excludes the synthetic `@SHARED` member. */
export async function listGroupMembers(db: Kysely<Database>, groupId: string): Promise<GroupMemberRef[]> {
  const rows = await db
    .selectFrom('members')
    .select(['member_name', 'account_type'])
    .where('group_id', '=', groupId)
    .where('member_name', '!=', SHARED_MEMBER)
    .execute();
  return rows.map((r) => ({ name: r.member_name, accountType: r.account_type }));
}

export interface MemberRef {
  memberId: string;
  memberName: string;
}

/** Across every group - used only by the hiscores poller. Excludes `@SHARED`. */
export async function listAllMembers(db: Kysely<Database>): Promise<MemberRef[]> {
  const rows = await db
    .selectFrom('members')
    .select(['member_id', 'member_name'])
    .where('member_name', '!=', SHARED_MEMBER)
    .execute();
  return rows.map((r) => ({ memberId: r.member_id, memberName: r.member_name }));
}
