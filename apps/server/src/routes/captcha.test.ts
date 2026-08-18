import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyCaptcha } from './captcha.js';

describe('verifyCaptcha', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when hCaptcha reports success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    );
    expect(await verifyCaptcha('response-token', 'secret')).toBe(true);
  });

  it('returns false when hCaptcha reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })),
    );
    expect(await verifyCaptcha('response-token', 'secret')).toBe(false);
  });

  it('returns false on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 })),
    );
    expect(await verifyCaptcha('response-token', 'secret')).toBe(false);
  });

  it('POSTs form-encoded response and secret', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await verifyCaptcha('my-response', 'my-secret');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://hcaptcha.com/siteverify');
    expect(init?.method).toBe('POST');
    expect(String(init?.body)).toContain('response=my-response');
    expect(String(init?.body)).toContain('secret=my-secret');
  });
});
