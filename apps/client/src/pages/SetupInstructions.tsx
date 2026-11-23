import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { SyncStatusPanel } from '../components/SyncStatusPanel.js';
import { useLogin } from '../state/LoginContext.js';

export function SetupInstructions(): React.JSX.Element {
  const { loginName, token } = useLogin();
  const [tokenRevealed, setTokenRevealed] = useState(false);

  if (!loginName || !token) {
    return <Navigate to="/create-login" replace />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Setup instructions</h1>
      </div>
      <div className="panel">
        <p>
          Install the <strong>OSRS MCP Tracker</strong> RuneLite plugin, then paste this token into its config panel:
        </p>
        <p>
          Token:{' '}
          {tokenRevealed ? (
            <strong className="token-value">{token}</strong>
          ) : (
            <button type="button" className="reveal-token" onClick={() => setTokenRevealed(true)}>
              Click to show
            </button>
          )}
        </p>
        <p>
          You&apos;re tracking as <strong>{loginName}</strong>.
        </p>
        <img src="/images/config_panel.png" alt="RuneLite plugin config panel" className="setup-instructions__image" />
      </div>
      <SyncStatusPanel />
    </div>
  );
}
