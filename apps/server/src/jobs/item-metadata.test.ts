import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/events.js', () => ({ upsertItemMetadata: vi.fn().mockResolvedValue(undefined) }));

const { upsertItemMetadata } = await import('../db/events.js');
const { deriveLowAlch, flattenBucketRow, syncItemMetadata } = await import('./item-metadata.js');

describe('deriveLowAlch', () => {
  it('is floor(0.4 * value)', () => {
    expect(deriveLowAlch(1000)).toBe(400);
    expect(deriveLowAlch(999)).toBe(399); // floor, not round
  });

  it('is null when value is null or absent', () => {
    expect(deriveLowAlch(null)).toBeNull();
    expect(deriveLowAlch(undefined)).toBeNull();
  });

  it('handles zero', () => {
    expect(deriveLowAlch(0)).toBe(0);
  });
});

describe('flattenBucketRow', () => {
  it('explodes a single item id into one record', () => {
    const rows = flattenBucketRow({
      item_id: ['4151'],
      item_name: 'Abyssal whip',
      high_alchemy_value: 72000,
      value: 120000,
      tradeable: true,
      is_members_only: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      itemId: 4151,
      name: 'Abyssal whip',
      highAlch: 72000,
      lowAlch: 48000,
      tradeable: true,
      membersOnly: true,
    });
  });

  it('explodes a repeated item_id field into multiple records', () => {
    const rows = flattenBucketRow({ item_id: ['1', '2', '3'], item_name: 'Multi-id item' });
    expect(rows.map((r) => r.itemId)).toEqual([1, 2, 3]);
  });

  it('skips non-numeric item ids', () => {
    const rows = flattenBucketRow({ item_id: ['123', 'not-a-number', '456'] });
    expect(rows.map((r) => r.itemId)).toEqual([123, 456]);
  });

  it('returns an empty array when item_id is absent', () => {
    expect(flattenBucketRow({ item_name: 'No ids' })).toEqual([]);
  });

  it('treats tradeable/is_members_only as presence flags, not their literal value', () => {
    // Untradeable, non-members item: Barrows gloves-style row where the fields are simply absent.
    const rows = flattenBucketRow({ item_id: ['1'], tradeable: undefined, is_members_only: undefined });
    expect(rows[0]?.tradeable).toBe(false);
    expect(rows[0]?.membersOnly).toBe(false);
  });

  it('treats a falsy-but-present value as still meaning true (presence, not content)', () => {
    const rows = flattenBucketRow({ item_id: ['1'], tradeable: false, is_members_only: 0 });
    expect(rows[0]?.tradeable).toBe(true);
    expect(rows[0]?.membersOnly).toBe(true);
  });
});

describe('syncItemMetadata', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops paging once a page comes back shorter than the page size', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ bucket: [{ item_id: ['4151'], item_name: 'Abyssal whip' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await syncItemMetadata({} as never);

    expect(fetchMock).toHaveBeenCalledTimes(1); // first page short (<5000) -> no further offsets fetched
    expect(upsertItemMetadata).toHaveBeenCalledWith({}, expect.objectContaining({ itemId: 4151, name: 'Abyssal whip' }));
  });

  it('throws on a non-ok Bucket API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    await expect(syncItemMetadata({} as never)).rejects.toThrow();
  });
});
