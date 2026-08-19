import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { MenButton } from '../components/MenButton.js';
import { useLogin } from '../state/LoginContext.js';

export function SetupInstructions(): React.JSX.Element {
  const { loginName, token } = useLogin();
  const [tokenRevealed, setTokenRevealed] = useState(false);

  if (!loginName || !token) {
    return <Navigate to="/create-login" replace />;
  }

  return (
    <div className="page-container">
      <div className="setup-instructions rsborder rsbackground">
        <h3>Setup instructions</h3>
        <p>
          Install the <strong>OSRS MCP Tracker</strong> RuneLite plugin, then paste these credentials into its config
          panel:
        </p>
        <p>
          Login name: <strong>{loginName}</strong>
        </p>
        <p>
          Token:{' '}
          {tokenRevealed ? (
            <strong>{token}</strong>
          ) : (
            <button type="button" className="reveal-token" onClick={() => setTokenRevealed(true)}>
              Click to show
            </button>
          )}
        </p>
        <img src="/images/config_panel.png" alt="RuneLite plugin config panel" className="setup-instructions__image" />
        <Link to="/manage">
          <MenButton>Continue</MenButton>
        </Link>
      </div>
    </div>
  );
}
