import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import {
  addGroupMember,
  createGroup,
  deleteGroupMember,
  getGroupIdByToken,
  getMemberId,
  GroupFullError,
  isMemberInGroup,
  listAllMembers,
  listGroupMembers,
  MAX_MEMBERS_PER_GROUP,
  renameGroupMember,
} from '../src/db/groups.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('groups', () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await startTestDb();
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('creates a group with a @SHARED member plus each named member', async () => {
    await createGroup(testDb.db, { name: 'alpha', memberNames: ['alice', 'bob'], tokenHash: 'hash-alpha' });

    const groupId = await getGroupIdByToken(testDb.db, 'alpha', 'hash-alpha');
    expect(groupId).toBeDefined();

    const members = await listGroupMembers(testDb.db, groupId!);
    expect(members.map((m) => m.name).sort()).toEqual(['alice', 'bob']);

    expect(await isMemberInGroup(testDb.db, groupId!, SHARED_MEMBER)).toBe(true);
  });

  it('supports a solo (1-member) group', async () => {
    await createGroup(testDb.db, { name: 'solo', memberNames: ['justme'], tokenHash: 'hash-solo' });
    const groupId = await getGroupIdByToken(testDb.db, 'solo', 'hash-solo');
    const members = await listGroupMembers(testDb.db, groupId!);
    expect(members).toHaveLength(1);
  });

  it('getGroupIdByToken returns undefined for a wrong token', async () => {
    await createGroup(testDb.db, { name: 'authtest', memberNames: ['a'], tokenHash: 'right-hash' });
    expect(await getGroupIdByToken(testDb.db, 'authtest', 'wrong-hash')).toBeUndefined();
  });

  it('addGroupMember enforces the 5-member cap and excludes @SHARED from the count', async () => {
    await createGroup(testDb.db, { name: 'fullgroup', memberNames: ['a', 'b', 'c', 'd', 'e'], tokenHash: 'h' });
    const groupId = await getGroupIdByToken(testDb.db, 'fullgroup', 'h');

    expect(await listGroupMembers(testDb.db, groupId!)).toHaveLength(MAX_MEMBERS_PER_GROUP);
    await expect(addGroupMember(testDb.db, groupId!, 'f')).rejects.toThrow(GroupFullError);
  });

  it('deleteGroupMember removes the member and is a no-op for an unknown name', async () => {
    await createGroup(testDb.db, { name: 'deletetest', memberNames: ['toremove'], tokenHash: 'h' });
    const groupId = await getGroupIdByToken(testDb.db, 'deletetest', 'h');

    await deleteGroupMember(testDb.db, groupId!, 'toremove');
    expect(await isMemberInGroup(testDb.db, groupId!, 'toremove')).toBe(false);

    await expect(deleteGroupMember(testDb.db, groupId!, 'never-existed')).resolves.not.toThrow();
  });

  it('renameGroupMember updates the name', async () => {
    await createGroup(testDb.db, { name: 'renametest', memberNames: ['before'], tokenHash: 'h' });
    const groupId = await getGroupIdByToken(testDb.db, 'renametest', 'h');

    await renameGroupMember(testDb.db, groupId!, 'before', 'after');
    expect(await isMemberInGroup(testDb.db, groupId!, 'before')).toBe(false);
    expect(await isMemberInGroup(testDb.db, groupId!, 'after')).toBe(true);
  });

  it('getMemberId resolves case-insensitively (citext)', async () => {
    await createGroup(testDb.db, { name: 'casetest', memberNames: ['MixedCase'], tokenHash: 'h' });
    const groupId = await getGroupIdByToken(testDb.db, 'casetest', 'h');

    expect(await getMemberId(testDb.db, groupId!, 'mixedcase')).toBeDefined();
    expect(await getMemberId(testDb.db, groupId!, 'MIXEDCASE')).toBeDefined();
  });

  it('listAllMembers spans every group and excludes @SHARED', async () => {
    await createGroup(testDb.db, { name: 'spanA', memberNames: ['spanmember1'], tokenHash: 'h' });
    await createGroup(testDb.db, { name: 'spanB', memberNames: ['spanmember2'], tokenHash: 'h2' });

    const all = await listAllMembers(testDb.db);
    const names = all.map((m) => m.memberName);
    expect(names).toContain('spanmember1');
    expect(names).toContain('spanmember2');
    expect(names).not.toContain(SHARED_MEMBER);
  });
});
