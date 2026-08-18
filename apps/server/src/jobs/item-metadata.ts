import type { Kysely } from 'kysely';
import type { Database } from '../db/types.js';
import { upsertItemMetadata } from '../db/events.js';
import { fetchWithTimeout } from '../http.js';
import { USER_AGENT } from './user-agent.js';

const BUCKET_API_URL = 'https://oldschool.runescape.wiki/api.php';
const PAGE_SIZE = 5000;
const PAGE_OFFSETS = [0, 5000, 10000, 15000];

export interface BucketItemRow {
  item_id?: string[];
  item_name?: string;
  high_alchemy_value?: number | null;
  value?: number | null;
  /** MediaWiki Bucket API convention: presence (any value, including falsy) means true. */
  tradeable?: unknown;
  is_members_only?: unknown;
}

export interface FlattenedItemMetadata {
  itemId: number;
  name: string;
  highAlch: number | null;
  lowAlch: number | null;
  tradeable: boolean;
  membersOnly: boolean;
}

/** No direct low-alch field on the Bucket table; empirically stable as floor(0.4 * value). */
export function deriveLowAlch(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.floor((value * 2) / 5);
}

/**
 * `item_id` is a repeated field since some Bucket rows cover multiple numeric ids - explodes
 * into one record per id, skipping non-numeric entries.
 */
export function flattenBucketRow(row: BucketItemRow): FlattenedItemMetadata[] {
  const results: FlattenedItemMetadata[] = [];
  for (const idStr of row.item_id ?? []) {
    const trimmed = idStr.trim();
    if (!/^\d+$/.test(trimmed)) continue;

    results.push({
      itemId: Number.parseInt(trimmed, 10),
      name: row.item_name ?? '',
      highAlch: row.high_alchemy_value ?? null,
      lowAlch: deriveLowAlch(row.value),
      tradeable: row.tradeable !== undefined && row.tradeable !== null,
      membersOnly: row.is_members_only !== undefined && row.is_members_only !== null,
    });
  }
  return results;
}

interface BucketQueryResponse {
  bucket: BucketItemRow[];
}

async function fetchBucketPage(offset: number): Promise<BucketItemRow[]> {
  const query = `bucket('infobox_item').select('item_id','item_name','high_alchemy_value','value','tradeable','is_members_only').limit(${PAGE_SIZE}).offset(${offset}).run()`;
  const url = `${BUCKET_API_URL}?action=bucket&format=json&query=${encodeURIComponent(query)}`;

  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`OSRS Wiki Bucket API request failed with status ${res.status}`);
  }
  const data = (await res.json()) as BucketQueryResponse;
  return data.bucket;
}

/** Paginates through the whole ~16,600-row item table, stopping once a page comes back short. */
export async function syncItemMetadata(db: Kysely<Database>): Promise<void> {
  for (const offset of PAGE_OFFSETS) {
    const page = await fetchBucketPage(offset);
    for (const row of page) {
      for (const item of flattenBucketRow(row)) {
        await upsertItemMetadata(db, {
          itemId: item.itemId,
          name: item.name,
          highAlch: item.highAlch,
          lowAlch: item.lowAlch,
          tradeable: item.tradeable,
          membersOnly: item.membersOnly,
        });
      }
    }
    if (page.length < PAGE_SIZE) break;
  }
}
