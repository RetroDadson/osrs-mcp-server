/**
 * In-process cache of averaged GE prices, populated by the GE-price background job and served
 * raw (pre-serialized) by `GET /api/ge-prices`. Starts empty until the job's first run.
 */
let cachedPricesJson = '{}';

export function getGePricesJson(): string {
  return cachedPricesJson;
}

export function setGePrices(prices: Record<number, number>): void {
  cachedPricesJson = JSON.stringify(prices);
}
