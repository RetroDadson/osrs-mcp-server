import { createHmac } from 'node:crypto';

/**
 * HMAC-SHA256(key = server secret, message = loginName + NUL + token) -> hex digest.
 * The NUL separator stops `loginName="ab"+token="c"` from hashing identically to
 * `loginName="a"+token="bc"`. Modernized from the prior BLAKE2s construction - there's no live
 * data to stay hash-compatible with, and this uses Node's built-in crypto with no extra
 * dependency.
 */
export function tokenHash(token: string, loginName: string, secret: string): string {
  return createHmac('sha256', secret).update(loginName).update('\0').update(token).digest('hex');
}
