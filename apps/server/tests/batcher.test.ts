import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startBatcher, type BatcherHandle, type PendingUpdate } from '../src/batcher/index.js';
import { createLogin, getLoginByTokenHash } from '../src/db/logins.js';
import { startTestDb, stopTestDb, type TestDb } from './helpers/test-db.js';

const BLANK: Omit<PendingUpdate, 'loginId'> = {
  stats: undefined,
  skills: undefined,
  quests: undefined,
  inventory: undefined,
  equipment: undefined,
  bank: undefined,
  sharedBank: undefined,
  runePouch: undefined,
  quiver: undefined,
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

function update(loginId: string, fields: Partial<PendingUpdate> = {}): PendingUpdate {
  return { loginId, ...BLANK, ...fields };
}

describe('update batcher (integration)', () => {
  let testDb: TestDb;
  let batcher: BatcherHandle;

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

  async function createTestLogin(name: string): Promise<string> {
    await createLogin(testDb.db, { name, tokenHash: `hash-${name}` });
    return (await getLoginByTokenHash(testDb.db, `hash-${name}`))!.loginId;
  }

  async function fetchLogin(loginId: string) {
    return testDb.db.selectFrom('logins').selectAll().where('login_id', '=', loginId).executeTakeFirstOrThrow();
  }

  it('persists a single update', async () => {
    const loginId = await createTestLogin('batchlogin1');
    batcher.enqueue(update(loginId, { stats: [1, 2, 3, 4, 5, 6] }));
    await batcher.flush();

    const login = await fetchLogin(loginId);
    expect(login.stats).toEqual([1, 2, 3, 4, 5, 6]);
    expect(login.stats_last_update).not.toBeNull();
  });

  it('merges two concurrent partial updates for the same login without losing fields', async () => {
    const loginId = await createTestLogin('batchlogin2');
    batcher.enqueue(update(loginId, { stats: [1, 1, 1, 1, 1, 1] }));
    batcher.enqueue(update(loginId, { skills: [100, 200, 0] }));
    await batcher.flush();

    const login = await fetchLogin(loginId);
    expect(login.stats).toEqual([1, 1, 1, 1, 1, 1]);
    expect(login.skills).toEqual([100, 200, 0]);
  });

  it('processes different logins independently in the same batch', async () => {
    const carolId = await createTestLogin('batchlogin3carol');
    const daveId = await createTestLogin('batchlogin3dave');
    batcher.enqueue(update(carolId, { skills: new Array(24).fill(5) }));
    batcher.enqueue(update(daveId, { skills: new Array(24).fill(9) }));
    await batcher.flush();

    expect((await fetchLogin(carolId)).skills).toEqual(new Array(24).fill(5));
    expect((await fetchLogin(daveId)).skills).toEqual(new Array(24).fill(9));
  });

  it('accumulates deposits within a batch rather than overwriting', async () => {
    const loginId = await createTestLogin('batchlogin4');
    batcher.enqueue(update(loginId, { bank: [1, 5] }));
    await batcher.flush();

    batcher.enqueue(update(loginId, { deposited: [2, 3] }));
    batcher.enqueue(update(loginId, { deposited: [2, 4] }));
    await batcher.flush();

    const login = await fetchLogin(loginId);
    // Existing bank [1,5] plus deposited 2x7 total of item 2 merged in.
    expect(login.bank).toEqual([1, 5, 2, 7]);
    expect(login.bank_last_update).not.toBeNull();
  });

  it('round-trips every batched field type in one update', async () => {
    const loginId = await createTestLogin('batchlogin5');
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
    const interacting = { name: 'Gargoyle', scale: 100, ratio: 1 };

    batcher.enqueue(
      update(loginId, {
        stats: [1, 2, 3, 4, 5, 6],
        skills: new Array(24).fill(1),
        quests: [0, 1, 255],
        inventory: new Array(56).fill(0),
        equipment: new Array(28).fill(0),
        bank: [4151, 1],
        sharedBank: [995, 1000],
        runePouch: new Array(8).fill(0),
        quiver: [892, 250],
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

    const login = await fetchLogin(loginId);
    expect(login.stats).toEqual([1, 2, 3, 4, 5, 6]);
    expect(login.skills).toEqual(new Array(24).fill(1));
    expect(Array.from(login.quests ?? [])).toEqual([0, 1, 255]);
    expect(login.inventory).toEqual(new Array(56).fill(0));
    expect(login.equipment).toEqual(new Array(28).fill(0));
    expect(login.bank).toEqual([4151, 1]);
    expect(login.shared_bank).toEqual([995, 1000]);
    expect(login.rune_pouch).toEqual(new Array(8).fill(0));
    expect(login.quiver).toEqual([892, 250]);
    expect(login.interacting).toEqual(interacting);
    expect(login.seed_vault).toEqual([]);
    expect(login.diary_vars).toEqual(new Array(62).fill(0));
    expect(login.collection_log).toEqual([1, 2, 3]);
    expect(login.potion_storage).toEqual(new Array(4).fill(0));
    expect(login.slayer_task).toEqual(slayerTask);
    expect(login.combat_achievements).toEqual([1, 2, 3, 4, 5, 6]);
    expect(login.farming_patches).toEqual(farmingPatches);
  });

  it('handles a batch larger than CHUNK_SIZE (55 logins)', async () => {
    const loginIds: string[] = [];
    for (let i = 0; i < 55; i++) {
      loginIds.push(await createTestLogin(`chunklogin${i}`));
    }
    for (let i = 0; i < 55; i++) {
      batcher.enqueue(update(loginIds[i]!, { stats: [i, i, i, i, i, i] }));
    }
    await batcher.flush();

    for (let i = 0; i < 55; i++) {
      const login = await fetchLogin(loginIds[i]!);
      expect(login.stats).toEqual([i, i, i, i, i, i]);
    }
  });

  it('persists across sequential batches cumulatively', async () => {
    const loginId = await createTestLogin('batchlogin9');
    batcher.enqueue(update(loginId, { stats: [1, 1, 1, 1, 1, 1] }));
    await batcher.flush();
    batcher.enqueue(update(loginId, { skills: [5, 5, 0] }));
    await batcher.flush();

    const login = await fetchLogin(loginId);
    expect(login.stats).toEqual([1, 1, 1, 1, 1, 1]);
    expect(login.skills).toEqual([5, 5, 0]);
  });
});
