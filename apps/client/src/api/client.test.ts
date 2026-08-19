import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addGroupMember,
  amILoggedIn,
  ApiError,
  createGroup,
  getCaptchaConfig,
  getGroupData,
  removeGroupMember,
  renameGroupMember,
} from './client.js';

function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('createGroup posts to /api/create-group and returns the parsed response', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ name: 'g', member_names: ['a'], token: 't' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createGroup('g', ['a'], '');
    expect(result).toEqual({ name: 'g', member_names: ['a'], token: 't' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/create-group');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      name: 'g',
      member_names: ['a'],
      captcha_response: '',
    });
  });

  it('createGroup throws ApiError with the server message on failure', async () => {
    mockFetchOnce(400, { message: 'Invalid group name' });
    await expect(createGroup('bad name!!', [], '')).rejects.toThrow(ApiError);
  });

  it('getCaptchaConfig returns the parsed config', async () => {
    mockFetchOnce(200, { enabled: true, sitekey: 'abc' });
    expect(await getCaptchaConfig()).toEqual({ enabled: true, sitekey: 'abc' });
  });

  it('amILoggedIn returns true on 200 and false on 401', async () => {
    mockFetchOnce(200, {});
    expect(await amILoggedIn('g', 't')).toBe(true);

    mockFetchOnce(401, {});
    expect(await amILoggedIn('g', 'wrong')).toBe(false);
  });

  it('amILoggedIn sends the raw token with no Bearer prefix', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await amILoggedIn('g', 'raw-token-value');

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'raw-token-value' });
  });

  it('getGroupData throws ApiError on a non-ok response', async () => {
    mockFetchOnce(401, {});
    await expect(getGroupData('g', 't')).rejects.toThrow(ApiError);
  });

  it('getGroupData returns the parsed member array on success', async () => {
    mockFetchOnce(200, [{ name: 'alice' }]);
    expect(await getGroupData('g', 't')).toEqual([{ name: 'alice' }]);
  });

  it('addGroupMember/removeGroupMember/renameGroupMember throw ApiError on failure', async () => {
    mockFetchOnce(400, { message: 'nope' });
    await expect(addGroupMember('g', 't', 'x')).rejects.toThrow(ApiError);

    mockFetchOnce(400, { message: 'nope' });
    await expect(removeGroupMember('g', 't', 'x')).rejects.toThrow(ApiError);

    mockFetchOnce(400, { message: 'nope' });
    await expect(renameGroupMember('g', 't', 'x', 'y')).rejects.toThrow(ApiError);
  });

  it('addGroupMember resolves on success', async () => {
    mockFetchOnce(201, {});
    await expect(addGroupMember('g', 't', 'x')).resolves.toBeUndefined();
  });
});
