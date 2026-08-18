import { fetchWithTimeout } from '../http.js';

const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify';

export async function verifyCaptcha(response: string, secret: string): Promise<boolean> {
  const body = new URLSearchParams({ response, secret });
  const res = await fetchWithTimeout(HCAPTCHA_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
