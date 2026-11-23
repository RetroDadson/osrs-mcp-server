import { useEffect, useState } from 'react';
import { getSyncStatus } from '../api/client.js';
import { useLogin } from '../state/LoginContext.js';

const POLL_INTERVAL_MS = 5000;

type Status = 'loading' | 'synced' | 'never-synced' | 'error';

/** Polls while mounted so the setup page can show a live "did it work?" confirmation instead of
 * requiring a manual refresh - also keeps the last-synced timestamp current as the plugin submits. */
export function SyncStatusPanel(): React.JSX.Element {
  const { token } = useLogin();
  const [status, setStatus] = useState<Status>('loading');
  const [lastUpdated, setLastUpdated] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    function check(): void {
      getSyncStatus(token!)
        .then((result) => {
          if (cancelled) return;
          setLastUpdated(result.lastUpdated);
          setStatus(result.lastUpdated ? 'synced' : 'never-synced');
        })
        .catch(() => {
          if (!cancelled) setStatus('error');
        });
    }

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  return (
    <section className="sync-status panel">
      <h3>Connection status</h3>
      {status === 'loading' && <p>Checking connection...</p>}
      {status === 'synced' && (
        <p>
          Last synced <strong>{new Date(lastUpdated!).toLocaleString()}</strong>.
        </p>
      )}
      {status === 'never-synced' && (
        <p>
          No data yet. Install the plugin, paste in your token, and log into your character in RuneLite - this will
          update automatically once it connects.
        </p>
      )}
      {status === 'error' && (
        <p className="validation-error">Couldn&apos;t check connection status. Try refreshing the page.</p>
      )}
    </section>
  );
}
