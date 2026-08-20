import type { AmILoggedInResponse, CaptchaConfig, CreateLoginResponse } from '@osrs-mcp/shared';

const BASE_URL = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  return res;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: token, 'Content-Type': 'application/json' };
}

export async function createLogin(playerName: string, captchaResponse: string): Promise<CreateLoginResponse> {
  const res = await request('/create-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_name: playerName, captcha_response: captchaResponse }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to create login');
  }
  return res.json() as Promise<CreateLoginResponse>;
}

export async function getCaptchaConfig(): Promise<CaptchaConfig> {
  const res = await request('/captcha-enabled');
  return res.json() as Promise<CaptchaConfig>;
}

/** Returns the resolved login name for a valid token, or null if the token is invalid. */
export async function amILoggedIn(token: string): Promise<string | null> {
  const res = await request('/am-i-logged-in', { headers: authHeaders(token) });
  if (!res.ok) return null;
  const body = (await res.json()) as AmILoggedInResponse;
  return body.login_name;
}

export async function renameLogin(token: string, newName: string): Promise<void> {
  const res = await request('/rename', {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ new_name: newName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to rename login');
  }
}
