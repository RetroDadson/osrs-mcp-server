import { createHmac } from 'node:crypto';

/**
 * HMAC-SHA256(key = server secret, message = token) -> hex digest. Modernized from the prior
 * BLAKE2s construction - there's no live data to stay hash-compatible with, and this uses Node's
 * built-in crypto with no extra dependency.
 */
export function tokenHash(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
