const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Native `fetch` has no default timeout - a hung external API (Wiki, Hiscores) would otherwise
 * stall a background job's cycle indefinitely with nothing to show for it until the next
 * interval. `AbortSignal.timeout` turns that into a normal rejected promise instead.
 */
export function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
