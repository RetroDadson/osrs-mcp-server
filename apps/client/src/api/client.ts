import type { CaptchaConfig, CreateLoginResponse, Member } from '@osrs-mcp/shared';

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

export async function createLogin(
  loginName: string,
  memberNames: string[],
  captchaResponse: string,
): Promise<CreateLoginResponse> {
  const res = await request('/create-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login_name: loginName, member_names: memberNames, captcha_response: captchaResponse }),
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

export async function amILoggedIn(loginName: string, token: string): Promise<boolean> {
  const res = await request(`/login/${encodeURIComponent(loginName)}/am-i-logged-in`, {
    headers: authHeaders(token),
  });
  return res.ok;
}

export async function getLoginData(loginName: string, token: string): Promise<Member[]> {
  const res = await request(
    `/login/${encodeURIComponent(loginName)}/get-data?from_time=1970-01-01T00:00:00.000Z`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to fetch login data');
  }
  return res.json() as Promise<Member[]>;
}

export async function addMember(loginName: string, token: string, name: string): Promise<void> {
  const res = await request(`/login/${encodeURIComponent(loginName)}/add-member`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to add member');
  }
}

export async function removeMember(loginName: string, token: string, name: string): Promise<void> {
  const res = await request(`/login/${encodeURIComponent(loginName)}/delete-member`, {
    method: 'DELETE',
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to remove member');
  }
}

export async function renameMember(
  loginName: string,
  token: string,
  originalName: string,
  newName: string,
): Promise<void> {
  const res = await request(`/login/${encodeURIComponent(loginName)}/rename-member`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ original_name: originalName, new_name: newName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to rename member');
  }
}
