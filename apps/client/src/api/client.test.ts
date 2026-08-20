import { afterEach, describe, expect, it, vi } from 'vitest';
import { amILoggedIn, ApiError, createLogin, getCaptchaConfig, renameLogin } from './client.js';

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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ login_name: 'g', token: 't' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createLogin('g', '');
    expect(result).toEqual({ login_name: 'g', token: 't' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/create-login');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      login_name: 'g',
      captcha_response: '',
    });
  });

  it('createLogin throws ApiError with the server message on failure', async () => {
    mockFetchOnce(400, { message: 'Invalid login name' });
    await expect(createLogin('bad name!!', '')).rejects.toThrow(ApiError);
  });

  it('getCaptchaConfig returns the parsed config', async () => {
    mockFetchOnce(200, { enabled: true, sitekey: 'abc' });
    expect(await getCaptchaConfig()).toEqual({ enabled: true, sitekey: 'abc' });
  });

  it('amILoggedIn returns the resolved login_name on 200 and null on 401', async () => {
    mockFetchOnce(200, { login_name: 'g' });
    expect(await amILoggedIn('t')).toBe('g');

    mockFetchOnce(401, {});
    expect(await amILoggedIn('wrong')).toBeNull();
  });

  it('amILoggedIn sends the raw token with no Bearer prefix', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ login_name: 'g' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await amILoggedIn('raw-token-value');

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'raw-token-value' });
  });

  it('renameLogin throws ApiError on failure', async () => {
    mockFetchOnce(400, { message: 'nope' });
    await expect(renameLogin('t', 'newname')).rejects.toThrow(ApiError);
  });

  it('renameLogin resolves on success', async () => {
    mockFetchOnce(200, {});
    await expect(renameLogin('t', 'newname')).resolves.toBeUndefined();
  });
});
