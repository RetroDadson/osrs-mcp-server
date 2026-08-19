import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addMember,
  amILoggedIn,
  ApiError,
  createLogin,
  getCaptchaConfig,
  getLoginData,
  removeMember,
  renameMember,
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

  it('createLogin posts to /api/create-login and returns the parsed response', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ login_name: 'g', member_names: ['a'], token: 't' }), { status: 201 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createLogin('g', ['a'], '');
    expect(result).toEqual({ login_name: 'g', member_names: ['a'], token: 't' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/create-login');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      login_name: 'g',
      member_names: ['a'],
      captcha_response: '',
    });
  });

  it('createLogin throws ApiError with the server message on failure', async () => {
    mockFetchOnce(400, { message: 'Invalid login name' });
    await expect(createLogin('bad name!!', [], '')).rejects.toThrow(ApiError);
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

  it('getLoginData throws ApiError on a non-ok response', async () => {
    mockFetchOnce(401, {});
    await expect(getLoginData('g', 't')).rejects.toThrow(ApiError);
  });

  it('getLoginData returns the parsed member array on success', async () => {
    mockFetchOnce(200, [{ name: 'alice' }]);
    expect(await getLoginData('g', 't')).toEqual([{ name: 'alice' }]);
  });

  it('addMember/removeMember/renameMember throw ApiError on failure', async () => {
    mockFetchOnce(400, { message: 'nope' });
    await expect(addMember('g', 't', 'x')).rejects.toThrow(ApiError);

    mockFetchOnce(400, { message: 'nope' });
    await expect(removeMember('g', 't', 'x')).rejects.toThrow(ApiError);

    mockFetchOnce(400, { message: 'nope' });
    await expect(renameMember('g', 't', 'x', 'y')).rejects.toThrow(ApiError);
  });

  it('addMember resolves on success', async () => {
    mockFetchOnce(201, {});
    await expect(addMember('g', 't', 'x')).resolves.toBeUndefined();
  });
});
