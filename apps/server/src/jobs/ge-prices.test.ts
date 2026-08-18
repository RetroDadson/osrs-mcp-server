import { afterEach, describe, expect, it, vi } from 'vitest';
import { averageGePrice, fetchGePrices } from './ge-prices.js';

describe('averageGePrice', () => {
  it('averages high and low with integer division when both are present', () => {
    expect(averageGePrice({ high: 100, low: 50 })).toBe(75);
    expect(averageGePrice({ high: 101, low: 50 })).toBe(75); // floor, not round
  });

  it('falls back to high alone when low is absent', () => {
    expect(averageGePrice({ high: 100, low: null })).toBe(100);
  });

  it('falls back to low alone when high is absent', () => {
    expect(averageGePrice({ high: null, low: 50 })).toBe(50);
  });

  it('is null when neither is present', () => {
    expect(averageGePrice({ high: null, low: null })).toBeNull();
  });
});

describe('fetchGePrices', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the wiki response into a flat itemId -> price record, skipping unpriced items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                '4151': { high: 100, low: 50 },
                '995': { high: null, low: null },
              },
            }),
            { status: 200 },
          ),
      ),
    );

    const prices = await fetchGePrices();
    expect(prices[4151]).toBe(75);
    expect(prices[995]).toBeUndefined();
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    await expect(fetchGePrices()).rejects.toThrow();
  });
});
