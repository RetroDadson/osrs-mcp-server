import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { MenButton } from '../components/MenButton.js';
import { useGroup } from '../state/GroupContext.js';

export function SetupInstructions(): React.JSX.Element {
  const { groupName, groupToken } = useGroup();
  const [tokenRevealed, setTokenRevealed] = useState(false);

  if (!groupName || !groupToken) {
    return <Navigate to="/create-group" replace />;
  }

  return (
    <div className="page-container">
      <div className="setup-instructions rsborder rsbackground">
        <h3>Setup instructions</h3>
        <p>
          Install the <strong>OSRS MCP Tracker</strong> RuneLite plugin, then paste these credentials into its Group
          Config:
        </p>
        <p>
          Group name: <strong>{groupName}</strong>
        </p>
        <p>
          Group token:{' '}
          {tokenRevealed ? (
            <strong>{groupToken}</strong>
          ) : (
            <button type="button" className="reveal-token" onClick={() => setTokenRevealed(true)}>
              Click to show
            </button>
          )}
        </p>
        <img src="/images/config_panel.png" alt="RuneLite plugin config panel" className="setup-instructions__image" />
        <Link to="/group">
          <MenButton>Go to group</MenButton>
        </Link>
      </div>
    </div>
  );
}
