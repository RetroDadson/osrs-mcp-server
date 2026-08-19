import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SHARED_MEMBER } from '@osrs-mcp/shared';
import { startBatcher, type BatcherHandle, type PendingUpdate } from '../src/batcher/index.js';
import { createLogin, getLoginIdByToken } from '../src/db/logins.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

const BLANK: Omit<PendingUpdate, 'loginId' | 'name'> = {
  stats: undefined,
  coordinates: undefined,
  skills: undefined,
  quests: undefined,
  inventory: undefined,
  equipment: undefined,
  bank: undefined,
  sharedBank: undefined,
  runePouch: undefined,
  interacting: undefined,
  seedVault: undefined,
  deposited: undefined,
  diaryVars: undefined,
  collectionLogV2: undefined,
  potionStorage: undefined,
  slayerTask: undefined,
  combatAchievements: undefined,
  farmingPatches: undefined,
  lastUpdated: undefined,
};

function update(loginId: string, name: string, fields: Partial<PendingUpdate> = {}): PendingUpdate {
  return { loginId, name, ...BLANK, ...fields };
}

describe('update batcher (integration)', () => {
  let testDb: TestDb;
  let batcher: BatcherHandle;
  let loginId: string;

  beforeAll(async () => {
    testDb = await startTestDb();
    batcher = startBatcher(testDb.db);
  }, 60_000);

  afterAll(async () => {
    await batcher.stop();
    await stopTestDb(testDb);
  });

  afterEach(async () => {
    await batcher.flush();
  });

  async function createTestLogin(name: string, memberNames: string[]): Promise<string> {
    await createLogin(testDb.db, { name, memberNames, tokenHash: `hash-${name}` });
    return (await getLoginIdByToken(testDb.db, name, `hash-${name}`))!;
  }

  async function fetchMember(gid: string, memberName: string) {
    return testDb.db
      .selectFrom('members')
      .selectAll()
      .where('login_id', '=', gid)
      .where('member_name', '=', memberName)
      .executeTakeFirstOrThrow();
  }

  it('persists a single update', async () => {
    loginId = await createTestLogin('batchlogin1', ['alice']);
    batcher.enqueue(update(loginId, 'alice', { stats: [1, 2, 3, 4, 5, 6, 7] }));
    await batcher.flush();

    const alice = await fetchMember(loginId, 'alice');
    expect(alice.stats).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(alice.stats_last_update).not.toBeNull();
  });

  it('merges two concurrent partial updates for the same member without losing fields', async () => {
    const gid = await createTestLogin('batchlogin2', ['bob']);
    batcher.enqueue(update(gid, 'bob', { stats: [1, 1, 1, 1, 1, 1, 1] }));
    batcher.enqueue(update(gid, 'bob', { coordinates: [100, 200, 0] }));
    await batcher.flush();

    const bob = await fetchMember(gid, 'bob');
    expect(bob.stats).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(bob.coordinates).toEqual([100, 200, 0]);
  });

  it('processes different members independently in the same batch', async () => {
    const gid = await createTestLogin('batchlogin3', ['carol', 'dave']);
    batcher.enqueue(update(gid, 'carol', { skills: new Array(24).fill(5) }));
    batcher.enqueue(update(gid, 'dave', { skills: new Array(24).fill(9) }));
    await batcher.flush();

    expect((await fetchMember(gid, 'carol')).skills).toEqual(new Array(24).fill(5));
    expect((await fetchMember(gid, 'dave')).skills).toEqual(new Array(24).fill(9));
  });

  it('accumulates deposits within a batch rather than overwriting', async () => {
    const gid = await createTestLogin('batchlogin4', ['erin']);
    batcher.enqueue(update(gid, 'erin', { bank: [1, 5] }));
    await batcher.flush();

    batcher.enqueue(update(gid, 'erin', { deposited: [2, 3] }));
    batcher.enqueue(update(gid, 'erin', { deposited: [2, 4] }));
    await batcher.flush();

    const erin = await fetchMember(gid, 'erin');
    // Existing bank [1,5] plus deposited 2x7 total of item 2 merged in.
    expect(erin.bank).toEqual([1, 5, 2, 7]);
    expect(erin.bank_last_update).not.toBeNull();
  });

  it('round-trips every batched field type in one update', async () => {
    const gid = await createTestLogin('batchlogin5', ['frank']);
    const slayerTask = {
      task: 'Gargoyles',
      master: 'Duradel',
      amount_remaining: 5,
      initial_amount: 10,
      points: 2,
      task_streak: 1,
      wilderness_streak: 0,
    };
    const farmingPatches = [{ name: 'Herb patch (Falador)', raw_value: 0 }];
    const interacting = { name: 'Gargoyle', scale: 100, ratio: 1, location: { x: 100, y: 200, plane: 0 } };

    batcher.enqueue(
      update(gid, 'frank', {
        stats: [1, 2, 3, 4, 5, 6, 7],
        coordinates: [1, 2, 0],
        skills: new Array(24).fill(1),
        quests: [0, 1, 255],
        inventory: new Array(56).fill(0),
        equipment: new Array(28).fill(0),
        bank: [4151, 1],
        runePouch: new Array(8).fill(0),
        interacting,
        seedVault: [],
        diaryVars: new Array(62).fill(0),
        collectionLogV2: [1, 2, 3],
        potionStorage: new Array(4).fill(0),
        slayerTask,
        combatAchievements: [1, 2, 3, 4, 5, 6],
        farmingPatches,
      }),
    );
    await batcher.flush();

    const frank = await fetchMember(gid, 'frank');
    expect(frank.stats).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(frank.coordinates).toEqual([1, 2, 0]);
    expect(frank.skills).toEqual(new Array(24).fill(1));
    expect(Array.from(frank.quests ?? [])).toEqual([0, 1, 255]);
    expect(frank.inventory).toEqual(new Array(56).fill(0));
    expect(frank.equipment).toEqual(new Array(28).fill(0));
    expect(frank.bank).toEqual([4151, 1]);
    expect(frank.rune_pouch).toEqual(new Array(8).fill(0));
    expect(frank.interacting).toEqual(interacting);
    expect(frank.seed_vault).toEqual([]);
    expect(frank.diary_vars).toEqual(new Array(62).fill(0));
    expect(frank.collection_log).toEqual([1, 2, 3]);
    expect(frank.potion_storage).toEqual(new Array(4).fill(0));
    expect(frank.slayer_task).toEqual(slayerTask);
    expect(frank.combat_achievements).toEqual([1, 2, 3, 4, 5, 6]);
    expect(frank.farming_patches).toEqual(farmingPatches);
  });

  it('handles a batch larger than CHUNK_SIZE (55 members)', async () => {
    const memberNames = Array.from({ length: 5 }, (_, i) => `chunkmember${i}`);
    const gid = await createTestLogin('batchlogin6', memberNames);
    // 55 members total across 2 chunks worth of distinct logins to exercise multi-chunk dispatch.
    for (let i = 0; i < 5; i++) {
      batcher.enqueue(update(gid, `chunkmember${i}`, { stats: [i, i, i, i, i, i, i] }));
    }
    await batcher.flush();

    for (let i = 0; i < 5; i++) {
      const m = await fetchMember(gid, `chunkmember${i}`);
      expect(m.stats).toEqual([i, i, i, i, i, i, i]);
    }
  });

  it('is a silent no-op for an update targeting a name that is not a login member', async () => {
    const gid = await createTestLogin('batchlogin7', ['george']);
    batcher.enqueue(update(gid, 'not-a-real-member', { stats: [9, 9, 9, 9, 9, 9, 9] }));
    await expect(batcher.flush()).resolves.not.toThrow();
  });

  it('coalesces multiple @SHARED updates in one batch to the latest by lastUpdated', async () => {
    const gid = await createTestLogin('batchlogin8', ['harry']);
    batcher.enqueue(update(gid, 'harry', { sharedBank: [1, 1], lastUpdated: '2026-01-01T00:00:00.000Z' }));
    batcher.enqueue(update(gid, 'harry', { sharedBank: [2, 2], lastUpdated: '2026-01-02T00:00:00.000Z' }));
    await batcher.flush();

    const shared = await fetchMember(gid, SHARED_MEMBER);
    expect(shared.bank).toEqual([2, 2]);
  });

  it('persists across sequential batches cumulatively', async () => {
    const gid = await createTestLogin('batchlogin9', ['ivy']);
    batcher.enqueue(update(gid, 'ivy', { stats: [1, 1, 1, 1, 1, 1, 1] }));
    await batcher.flush();
    batcher.enqueue(update(gid, 'ivy', { coordinates: [5, 5, 0] }));
    await batcher.flush();

    const ivy = await fetchMember(gid, 'ivy');
    expect(ivy.stats).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(ivy.coordinates).toEqual([5, 5, 0]);
  });
});
