import type { CaptchaConfig, CreateGroupResponse, GroupMember } from '@osrs-mcp/shared';

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

export async function createGroup(
  name: string,
  memberNames: string[],
  captchaResponse: string,
): Promise<CreateGroupResponse> {
  const res = await request('/create-group', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, member_names: memberNames, captcha_response: captchaResponse }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to create group');
  }
  return res.json() as Promise<CreateGroupResponse>;
}

export async function getCaptchaConfig(): Promise<CaptchaConfig> {
  const res = await request('/captcha-enabled');
  return res.json() as Promise<CaptchaConfig>;
}

export async function amILoggedIn(groupName: string, token: string): Promise<boolean> {
  const res = await request(`/group/${encodeURIComponent(groupName)}/am-i-logged-in`, {
    headers: authHeaders(token),
  });
  return res.ok;
}

export async function getGroupData(groupName: string, token: string): Promise<GroupMember[]> {
  const res = await request(
    `/group/${encodeURIComponent(groupName)}/get-group-data?from_time=1970-01-01T00:00:00.000Z`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to fetch group data');
  }
  return res.json() as Promise<GroupMember[]>;
}

export async function addGroupMember(groupName: string, token: string, name: string): Promise<void> {
  const res = await request(`/group/${encodeURIComponent(groupName)}/add-group-member`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to add member');
  }
}

export async function removeGroupMember(groupName: string, token: string, name: string): Promise<void> {
  const res = await request(`/group/${encodeURIComponent(groupName)}/delete-group-member`, {
    method: 'DELETE',
    headers: authHeaders(token),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to remove member');
  }
}

export async function renameGroupMember(
  groupName: string,
  token: string,
  originalName: string,
  newName: string,
): Promise<void> {
  const res = await request(`/group/${encodeURIComponent(groupName)}/rename-group-member`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ original_name: originalName, new_name: newName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { message?: string }).message ?? 'Failed to rename member');
  }
}
