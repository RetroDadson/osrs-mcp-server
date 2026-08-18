import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aggregateSkills, applySkillsRetention, getSkillsForPeriod } from '../src/db/skills.js';
import { createGroup, getGroupIdByToken } from '../src/db/groups.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('skills aggregation and retention', () => {
  let testDb: TestDb;
  let groupId: string;
  let memberId: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    await createGroup(testDb.db, { name: 'skillstest', memberNames: ['skiller'], tokenHash: 'h' });
    groupId = (await getGroupIdByToken(testDb.db, 'skillstest', 'h'))!;
    const member = await testDb.db
      .selectFrom('members')
      .select('member_id')
      .where('group_id', '=', groupId)
      .where('member_name', '=', 'skiller')
      .executeTakeFirstOrThrow();
    memberId = member.member_id;
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('aggregateSkills buckets the current snapshot into all three period tables', async () => {
    await testDb.db
      .updateTable('members')
      .set({ skills: new Array(24).fill(10) })
      .where('member_id', '=', memberId)
      .execute();

    await aggregateSkills(testDb.db);

    const day = await testDb.db.selectFrom('skills_day').selectAll().where('member_id', '=', memberId).execute();
    const month = await testDb.db.selectFrom('skills_month').selectAll().where('member_id', '=', memberId).execute();
    const year = await testDb.db.selectFrom('skills_year').selectAll().where('member_id', '=', memberId).execute();

    expect(day).toHaveLength(1);
    expect(month).toHaveLength(1);
    expect(year).toHaveLength(1);
    expect(day[0]?.skills).toEqual(new Array(24).fill(10));
  });

  it('re-aggregating within the same hour/day/month bucket overwrites rather than duplicates', async () => {
    await testDb.db
      .updateTable('members')
      .set({ skills: new Array(24).fill(20) })
      .where('member_id', '=', memberId)
      .execute();

    await aggregateSkills(testDb.db);

    const day = await testDb.db.selectFrom('skills_day').selectAll().where('member_id', '=', memberId).execute();
    expect(day).toHaveLength(1);
    expect(day[0]?.skills).toEqual(new Array(24).fill(20));
  });

  it('advances aggregation_info.last_aggregation', async () => {
    const info = await testDb.db
      .selectFrom('aggregation_info')
      .select('last_aggregation')
      .where('type', '=', 'skills')
      .executeTakeFirstOrThrow();
    expect(info.last_aggregation.getTime()).toBeGreaterThan(0);
  });

  it('getSkillsForPeriod groups rows by member name within the group', async () => {
    const dayData = await getSkillsForPeriod(testDb.db, groupId, 'skills_day');
    const skiller = dayData.find((m) => m.name === 'skiller');
    expect(skiller).toBeDefined();
    expect(skiller!.skill_data.length).toBeGreaterThanOrEqual(1);
  });

  it('applySkillsRetention keeps rows newer than the window and prunes older ones except the most recent', async () => {
    // Seed two stale rows (older than the 1-day retention window for skills_day) directly.
    await testDb.db
      .insertInto('skills_day')
      .values([
        { member_id: memberId, time: sql`NOW() - INTERVAL '10 days'` as never, skills: new Array(24).fill(1) },
        { member_id: memberId, time: sql`NOW() - INTERVAL '5 days'` as never, skills: new Array(24).fill(2) },
      ])
      .execute();

    await applySkillsRetention(testDb.db);

    const remaining = await testDb.db
      .selectFrom('skills_day')
      .select(['time', 'skills'])
      .where('member_id', '=', memberId)
      .where('time', '<', sql<Date>`NOW() - INTERVAL '1 day'`)
      .execute();

    // Only the single most-recent stale row (the -5 days one, skills=[2,2,...]) should survive.
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.skills).toEqual(new Array(24).fill(2));
  });
});
