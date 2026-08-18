import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hiscoreUrl,
  isRanked,
  isRankedActivity,
  probeAccountHiscores,
  PROBE_ORDER,
  syncMemberHiscores,
  type HiscoreResponse,
} from './hiscores.js';

describe('PROBE_ORDER', () => {
  it('is most-restrictive-first: hardcore, ultimate, ironman, then regular fallback', () => {
    expect(PROBE_ORDER).toEqual(['hardcore_ironman', 'ultimate', 'ironman', 'regular']);
  });
});

describe('hiscoreUrl', () => {
  it('builds the correct path segment per account type', () => {
    expect(hiscoreUrl('regular', 'Zezima')).toContain('m=hiscore_oldschool/');
    expect(hiscoreUrl('ironman', 'Zezima')).toContain('m=hiscore_oldschool_ironman/');
    expect(hiscoreUrl('hardcore_ironman', 'Zezima')).toContain('m=hiscore_oldschool_hardcore_ironman/');
    expect(hiscoreUrl('ultimate', 'Zezima')).toContain('m=hiscore_oldschool_ultimate/');
  });

  it('encodes spaces in the player name as %20', () => {
    expect(hiscoreUrl('regular', 'The Old Nite')).toContain('player=The%20Old%20Nite');
  });
});

function response(overallRank: number): HiscoreResponse {
  return {
    skills: [{ id: -1, name: 'Overall', rank: overallRank, level: 1, xp: 0 }],
    activities: [],
  };
}

describe('isRanked', () => {
  it('is true when the Overall skill has a positive rank', () => {
    expect(isRanked(response(12345))).toBe(true);
  });

  it('is false for a rank of -1 (the regular board placeholder for non-matching modes)', () => {
    expect(isRanked(response(-1))).toBe(false);
  });

  it('is false when the Overall skill is missing entirely', () => {
    expect(isRanked({ skills: [], activities: [] })).toBe(false);
  });
});

describe('isRankedActivity', () => {
  it('treats rank > 0 as ranked, rank <= 0 as unranked', () => {
    expect(isRankedActivity({ id: 1, name: 'Zulrah', rank: 500, score: 10 })).toBe(true);
    expect(isRankedActivity({ id: 1, name: 'Zulrah', rank: -1, score: -1 })).toBe(false);
    expect(isRankedActivity({ id: 1, name: 'Zulrah', rank: 0, score: 0 })).toBe(false);
  });
});

describe('probeAccountHiscores', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops at the first genuinely-ranked board (most-restrictive-first)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('hardcore_ironman')) {
        return new Response(JSON.stringify(response(-1)), { status: 200 });
      }
      if (url.includes('hiscore_oldschool_ultimate')) {
        return new Response(JSON.stringify(response(42)), { status: 200 });
      }
      throw new Error('should not reach further boards');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeAccountHiscores('Zezima');
    expect(result?.accountType).toBe('ultimate');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a 404 as "not on this board" and keeps probing', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('hardcore_ironman') || url.includes('ultimate') || url.includes('hiscore_oldschool_ironman')) {
        return new Response('', { status: 404 });
      }
      return new Response(JSON.stringify(response(1)), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await probeAccountHiscores('RegularPlayer');
    expect(result?.accountType).toBe('regular');
  });

  it('returns undefined when no board has a genuine match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(response(-1)), { status: 200 })),
    );

    expect(await probeAccountHiscores('NoSuchPlayer')).toBeUndefined();
  });
});

describe('syncMemberHiscores', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false without touching the db when the member has no match on any board', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(response(-1)), { status: 200 })),
    );

    // db is never dereferenced on this early-return path - passing a bare object proves it.
    const synced = await syncMemberHiscores({} as never, { memberId: '1', memberName: 'Nobody' });
    expect(synced).toBe(false);
  });
});
