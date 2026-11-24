import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    hcaptcha?: {
      render: (containerId: string, opts: { sitekey: string }) => string;
      getResponse: (widgetId: string) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = 'hcaptcha-script';
const CONTAINER_ID = 'hcaptcha-container';

function loadHcaptchaScript(): Promise<void> {
  if (window.hcaptcha) return Promise.resolve();
  return new Promise((resolve) => {
    if (document.getElementById(SCRIPT_ID)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit&onload=onHcaptchaLoaded';
    (window as unknown as { onHcaptchaLoaded: () => void }).onHcaptchaLoaded = () => resolve();
    document.head.appendChild(script);
  });
}

interface Props {
  sitekey: string;
  onWidgetReady: (getResponse: () => string) => void;
}

/** hCaptcha only reliably renders into its first-ever container in a page session - the script
 * tag and container are removed on unmount so a later remount gets a clean slate. */
export function Captcha({ sitekey, onWidgetReady }: Readonly<Props>): React.JSX.Element {
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // loadHcaptchaScript never rejects, so there is no failure path to handle here.
    void loadHcaptchaScript().then(() => {
      if (cancelled || !window.hcaptcha) return;
      const widgetId = window.hcaptcha.render(CONTAINER_ID, { sitekey });
      widgetIdRef.current = widgetId;
      onWidgetReady(() => window.hcaptcha!.getResponse(widgetId));
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.hcaptcha) {
        window.hcaptcha.remove(widgetIdRef.current);
      }
      document.getElementById(SCRIPT_ID)?.remove();
      window.hcaptcha = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitekey]);

  return <div id={CONTAINER_ID} />;
}
