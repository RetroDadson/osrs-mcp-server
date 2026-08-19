import { sql, type Kysely } from 'kysely';
import type { AggregateSkillData, LoginSkillData } from '@osrs-mcp/shared';
import type { Database } from './types.js';

export type SkillsPeriodTable = 'skills_day' | 'skills_month' | 'skills_year';

interface PeriodConfig {
  truncUnit: 'hour' | 'day' | 'month';
  retentionInterval: string;
}

/** Day-bucket rows are grouped hourly, month-bucket rows daily, year-bucket rows monthly. */
const PERIOD_CONFIG: Record<SkillsPeriodTable, PeriodConfig> = {
  skills_day: { truncUnit: 'hour', retentionInterval: '1 day' },
  skills_month: { truncUnit: 'day', retentionInterval: '1 month' },
  skills_year: { truncUnit: 'month', retentionInterval: '1 year' },
};

/**
 * Buckets every member's current `skills` snapshot into `skills_day/month/year`, using
 * `aggregation_info.last_aggregation` (type='skills') as the "only members touched since then"
 * cutoff, then advances that cutoff to now - all in one transaction.
 */
export async function aggregateSkills(db: Kysely<Database>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const info = await trx
      .selectFrom('aggregation_info')
      .select('last_aggregation')
      .where('type', '=', 'skills')
      .executeTakeFirstOrThrow();

    for (const table of Object.keys(PERIOD_CONFIG) as SkillsPeriodTable[]) {
      const { truncUnit } = PERIOD_CONFIG[table];
      await sql`
        INSERT INTO ${sql.raw(`osrsmcp.${table}`)} (member_id, time, skills)
        SELECT member_id, date_trunc(${truncUnit}, skills_last_update), skills
        FROM osrsmcp.members
        WHERE skills_last_update IS NOT NULL
          AND skills IS NOT NULL
          AND skills_last_update >= ${info.last_aggregation}
        ON CONFLICT (member_id, time) DO UPDATE SET skills = excluded.skills
      `.execute(trx);
    }

    await trx
      .updateTable('aggregation_info')
      .set({ last_aggregation: new Date() })
      .where('type', '=', 'skills')
      .execute();
  });
}

/**
 * Prunes rows older than each period's retention window, except the single most-recent
 * past-cutoff row per member - keeping one "last known" data point even after pruning.
 */
export async function applySkillsRetention(db: Kysely<Database>): Promise<void> {
  for (const table of Object.keys(PERIOD_CONFIG) as SkillsPeriodTable[]) {
    const { retentionInterval } = PERIOD_CONFIG[table];
    await sql`
      DELETE FROM ${sql.raw(`osrsmcp.${table}`)}
      WHERE time < NOW() - ${retentionInterval}::interval
        AND (member_id, time) NOT IN (
          SELECT DISTINCT ON (member_id) member_id, time
          FROM ${sql.raw(`osrsmcp.${table}`)}
          WHERE time < NOW() - ${retentionInterval}::interval
          ORDER BY member_id, time DESC
        )
    `.execute(db);
  }
}

export async function getSkillsForPeriod(
  db: Kysely<Database>,
  loginId: string,
  table: SkillsPeriodTable,
): Promise<LoginSkillData> {
  const rows = await db
    .selectFrom(table)
    .innerJoin('members', 'members.member_id', `${table}.member_id`)
    .select(['members.member_name as name', `${table}.time as time`, `${table}.skills as skills`])
    .where('members.login_id', '=', loginId)
    .execute();

  const byMember = new Map<string, AggregateSkillData[]>();
  for (const row of rows) {
    const list = byMember.get(row.name) ?? [];
    list.push({ time: row.time.toISOString(), data: row.skills });
    byMember.set(row.name, list);
  }

  return Array.from(byMember.entries()).map(([name, skill_data]) => ({ name, skill_data }));
}
