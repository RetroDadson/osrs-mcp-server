import { createHmac } from 'node:crypto';

/**
 * HMAC-SHA256(key = server secret, message = groupName + NUL + token) -> hex digest.
 * The NUL separator stops `groupName="ab"+token="c"` from hashing identically to
 * `groupName="a"+token="bc"`. Modernized from the prior BLAKE2s construction - there's no live
 * data to stay hash-compatible with, and this uses Node's built-in crypto with no extra
 * dependency.
 */
export function tokenHash(token: string, groupName: string, secret: string): string {
  return createHmac('sha256', secret).update(groupName).update('\0').update(token).digest('hex');
}
