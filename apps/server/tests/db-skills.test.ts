import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aggregateSkills, applySkillsRetention, getSkillsForPeriod } from '../src/db/skills.js';
import { createLogin, getLoginByTokenHash } from '../src/db/logins.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

describe('skills aggregation and retention', () => {
  let testDb: TestDb;
  let loginId: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    await createLogin(testDb.db, { name: 'skillstest', tokenHash: 'h' });
    loginId = (await getLoginByTokenHash(testDb.db, 'h'))!.loginId;
  }, 60_000);

  afterAll(async () => {
    await stopTestDb(testDb);
  });

  it('aggregateSkills buckets the current snapshot into all three period tables', async () => {
    await testDb.db.updateTable('logins').set({ skills: new Array(24).fill(10) }).where('login_id', '=', loginId).execute();

    await aggregateSkills(testDb.db);

    const day = await testDb.db.selectFrom('skills_day').selectAll().where('login_id', '=', loginId).execute();
    const month = await testDb.db.selectFrom('skills_month').selectAll().where('login_id', '=', loginId).execute();
    const year = await testDb.db.selectFrom('skills_year').selectAll().where('login_id', '=', loginId).execute();

    expect(day).toHaveLength(1);
    expect(month).toHaveLength(1);
    expect(year).toHaveLength(1);
    expect(day[0]?.skills).toEqual(new Array(24).fill(10));
  });

  it('re-aggregating within the same hour/day/month bucket overwrites rather than duplicates', async () => {
    await testDb.db.updateTable('logins').set({ skills: new Array(24).fill(20) }).where('login_id', '=', loginId).execute();

    await aggregateSkills(testDb.db);

    const day = await testDb.db.selectFrom('skills_day').selectAll().where('login_id', '=', loginId).execute();
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

  it('getSkillsForPeriod returns a flat time series for the login', async () => {
    const dayData = await getSkillsForPeriod(testDb.db, loginId, 'skills_day');
    expect(dayData.length).toBeGreaterThanOrEqual(1);
    expect(dayData[0]?.data).toEqual(new Array(24).fill(20));
  });

  it('applySkillsRetention keeps rows newer than the window and prunes older ones except the most recent', async () => {
    // Seed two stale rows (older than the 1-day retention window for skills_day) directly.
    await testDb.db
      .insertInto('skills_day')
      .values([
        { login_id: loginId, time: sql`NOW() - INTERVAL '10 days'` as never, skills: new Array(24).fill(1) },
        { login_id: loginId, time: sql`NOW() - INTERVAL '5 days'` as never, skills: new Array(24).fill(2) },
      ])
      .execute();

    await applySkillsRetention(testDb.db);

    const remaining = await testDb.db
      .selectFrom('skills_day')
      .select(['time', 'skills'])
      .where('login_id', '=', loginId)
      .where('time', '<', sql<Date>`NOW() - INTERVAL '1 day'`)
      .execute();

    // Only the single most-recent stale row (the -5 days one, skills=[2,2,...]) should survive.
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.skills).toEqual(new Array(24).fill(2));
  });
});
