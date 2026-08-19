import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Captcha } from './Captcha.js';

describe('Captcha', () => {
  afterEach(() => {
    document.getElementById('hcaptcha-script')?.remove();
    (window as unknown as { hcaptcha?: unknown }).hcaptcha = undefined;
  });

  it('renders a widget once hcaptcha reports the script loaded, and exposes getResponse', async () => {
    const render_ = vi.fn().mockReturnValue('widget-1');
    const getResponse = vi.fn().mockReturnValue('captcha-response-value');
    const remove = vi.fn();

    const onWidgetReady = vi.fn();
    const { unmount } = render(<Captcha sitekey="site123" onWidgetReady={onWidgetReady} />);

    // Simulate the hCaptcha script finishing its own load and invoking the global callback.
    window.hcaptcha = { render: render_, getResponse, remove };
    (window as unknown as { onHcaptchaLoaded: () => void }).onHcaptchaLoaded();

    await waitFor(() => expect(render_).toHaveBeenCalledWith('hcaptcha-container', { sitekey: 'site123' }));
    await waitFor(() => expect(onWidgetReady).toHaveBeenCalled());

    const getter = onWidgetReady.mock.calls[0]![0] as () => string;
    expect(getter()).toBe('captcha-response-value');

    unmount();
    expect(remove).toHaveBeenCalledWith('widget-1');
    expect(document.getElementById('hcaptcha-script')).not.toBeInTheDocument();
  });

  it('does not re-inject the script tag if one is already present', () => {
    const script = document.createElement('script');
    script.id = 'hcaptcha-script';
    document.head.appendChild(script);

    render(<Captcha sitekey="site123" onWidgetReady={vi.fn()} />);
    expect(document.querySelectorAll('#hcaptcha-script')).toHaveLength(1);
  });
});
