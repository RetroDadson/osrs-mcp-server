import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ge-prices.js', () => ({ fetchGePrices: vi.fn().mockResolvedValue({ 1: 100 }) }));
vi.mock('./hiscores.js', () => ({ syncMemberHiscores: vi.fn().mockResolvedValue(true) }));
vi.mock('./item-metadata.js', () => ({ syncItemMetadata: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../db/skills.js', () => ({ aggregateSkills: vi.fn().mockResolvedValue(undefined), applySkillsRetention: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../db/groups.js', () => ({ listAllMembers: vi.fn().mockResolvedValue([{ memberId: '1', memberName: 'alice' }]) }));
vi.mock('../routes/ge-price-cache.js', () => ({ setGePrices: vi.fn() }));

const { fetchGePrices } = await import('./ge-prices.js');
const { syncMemberHiscores } = await import('./hiscores.js');
const { syncItemMetadata } = await import('./item-metadata.js');
const { aggregateSkills, applySkillsRetention } = await import('../db/skills.js');
const { setGePrices } = await import('../routes/ge-price-cache.js');
const {
  startGeUpdater,
  startHiscoresPoller,
  startItemMetadataSync,
  startSkillsAggregator,
  startAllJobs,
  GE_UPDATE_INTERVAL_MS,
} = await import('./scheduler.js');

function stubLogger() {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as never;
}

describe('job scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('startGeUpdater runs immediately and populates the price cache', async () => {
    const handle = startGeUpdater(stubLogger());
    await vi.waitFor(() => expect(setGePrices).toHaveBeenCalledWith({ 1: 100 }));
    handle.stop();
  });

  it('startGeUpdater runs again after the interval elapses', async () => {
    const handle = startGeUpdater(stubLogger());
    await vi.waitFor(() => expect(fetchGePrices).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(GE_UPDATE_INTERVAL_MS);
    expect(fetchGePrices).toHaveBeenCalledTimes(2);
    handle.stop();
  });

  it('a failed run is logged, not thrown, and does not stop future runs', async () => {
    vi.mocked(fetchGePrices).mockRejectedValueOnce(new Error('network down'));
    const logger = stubLogger();

    const handle = startGeUpdater(logger);
    await vi.waitFor(() => expect((logger as { error: ReturnType<typeof vi.fn> }).error).toHaveBeenCalled());
    handle.stop();
  });

  it('startSkillsAggregator runs both aggregation and retention', async () => {
    const handle = startSkillsAggregator(stubLogger(), {} as never);
    await vi.waitFor(() => {
      expect(aggregateSkills).toHaveBeenCalled();
      expect(applySkillsRetention).toHaveBeenCalled();
    });
    handle.stop();
  });

  it('startHiscoresPoller syncs every member returned by listAllMembers', async () => {
    const handle = startHiscoresPoller(stubLogger(), {} as never);
    await vi.waitFor(() => expect(syncMemberHiscores).toHaveBeenCalledWith({}, { memberId: '1', memberName: 'alice' }));
    handle.stop();
  });

  it('startItemMetadataSync runs the wiki sync', async () => {
    const handle = startItemMetadataSync(stubLogger(), {} as never);
    await vi.waitFor(() => expect(syncItemMetadata).toHaveBeenCalled());
    handle.stop();
  });

  it('startAllJobs starts and stops every job together', async () => {
    const handle = startAllJobs(stubLogger(), {} as never);
    await vi.waitFor(() => expect(fetchGePrices).toHaveBeenCalled());
    expect(() => handle.stop()).not.toThrow();
  });
});
