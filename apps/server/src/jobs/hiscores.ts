import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { updateAccountType, upsertHiscoreActivity } from '../db/events.js';
import type { MemberRef } from '../db/groups.js';
import { fetchWithTimeout } from '../http.js';
import { USER_AGENT } from './user-agent.js';

export type AccountType = 'hardcore_ironman' | 'ultimate' | 'ironman' | 'regular';

/** Most-restrictive-first: whichever board a name is genuinely ranked on identifies its mode. */
export const PROBE_ORDER: readonly AccountType[] = ['hardcore_ironman', 'ultimate', 'ironman', 'regular'];

const HISCORE_PATH_SEGMENT: Record<AccountType, string> = {
  hardcore_ironman: 'hiscore_oldschool_hardcore_ironman',
  ultimate: 'hiscore_oldschool_ultimate',
  ironman: 'hiscore_oldschool_ironman',
  regular: 'hiscore_oldschool',
};

export function hiscoreUrl(accountType: AccountType, playerName: string): string {
  const segment = HISCORE_PATH_SEGMENT[accountType];
  const encodedName = playerName.replaceAll(' ', '%20');
  return `https://secure.runescape.com/m=${segment}/index_lite.json?player=${encodedName}`;
}

export interface HiscoreSkill {
  id: number;
  name: string;
  rank: number;
  level: number;
  xp: number;
}

export interface HiscoreActivity {
  id: number;
  name: string;
  rank: number;
  score: number;
}

export interface HiscoreResponse {
  skills: HiscoreSkill[];
  activities: HiscoreActivity[];
}

/**
 * HTTP 200 alone isn't proof of a real match - the regular board returns rank:-1 placeholders
 * for every account, ironman or not. A genuine match has a ranked (rank > 0) Overall skill.
 */
export function isRanked(response: HiscoreResponse): boolean {
  const overall = response.skills.find((s) => s.name === 'Overall');
  return overall !== undefined && overall.rank > 0;
}

/**
 * The Hiscores only rank most bosses after 5 kills (The Mimic and TzKal-Zuk need just 1) -
 * unranked activities show `rank <= 0` (usually score -1, occasionally 0). Treat rank as the
 * signal, not score alone.
 */
export function isRankedActivity(activity: HiscoreActivity): boolean {
  return activity.rank > 0;
}

export interface HiscoreProbeResult {
  accountType: AccountType;
  response: HiscoreResponse;
}

/**
 * Tries each board most-restrictive-first, stopping at the first genuinely-ranked match. A 404
 * means "not on this leaderboard" (not an error) - keep probing. No match across all four boards
 * leaves the member unsynced this cycle (retried next interval).
 */
export async function probeAccountHiscores(playerName: string): Promise<HiscoreProbeResult | undefined> {
  for (const accountType of PROBE_ORDER) {
    const res = await fetchWithTimeout(hiscoreUrl(accountType, playerName), { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 404 || !res.ok) continue;

    const response = (await res.json()) as HiscoreResponse;
    if (isRanked(response)) {
      return { accountType, response };
    }
  }
  return undefined;
}

export async function syncMemberHiscores(db: Kysely<Database>, member: MemberRef): Promise<boolean> {
  const probe = await probeAccountHiscores(member.memberName);
  if (!probe) return false;

  await updateAccountType(db, member.memberId, probe.accountType);
  for (const activity of probe.response.activities) {
    if (isRankedActivity(activity)) {
      await upsertHiscoreActivity(db, member.memberId, activity.name, activity.score);
    }
  }
  return true;
}
