import { fetchWithTimeout } from '../http.js';
import { USER_AGENT } from './user-agent.js';

const GE_PRICES_URL = 'https://prices.runescape.wiki/api/v1/osrs/latest';

interface WikiGePriceEntry {
  high: number | null;
  low: number | null;
}

interface WikiGePricesResponse {
  data: Record<string, WikiGePriceEntry>;
}

/** high alone, or low alone, or the (integer-divided) average of both if present. */
export function averageGePrice(entry: WikiGePriceEntry): number | null {
  if (entry.high !== null && entry.low !== null) return Math.floor((entry.high + entry.low) / 2);
  if (entry.high !== null) return entry.high;
  if (entry.low !== null) return entry.low;
  return null;
}

export async function fetchGePrices(): Promise<Record<number, number>> {
  const res = await fetchWithTimeout(GE_PRICES_URL, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`GE prices request failed with status ${res.status}`);
  }

  const data = (await res.json()) as WikiGePricesResponse;
  const result: Record<number, number> = {};
  for (const [itemIdText, entry] of Object.entries(data.data)) {
    const price = averageGePrice(entry);
    if (price !== null) {
      result[Number(itemIdText)] = price;
    }
  }
  return result;
}
