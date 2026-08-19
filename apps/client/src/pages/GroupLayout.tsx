import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { DonateButton } from '../components/DonateButton.js';
import { MenButton } from '../components/MenButton.js';
import { useGroup } from '../state/GroupContext.js';
import { getLayoutDirection } from '../state/storage.js';

export function GroupLayout(): React.JSX.Element {
  const { groupName, groupToken, refreshMembers } = useGroup();
  const location = useLocation();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshMembers().finally(() => setLoading(false));
    // Only re-run when the group identity actually changes, not on every refreshMembers identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupName, groupToken]);

  if (!groupName || !groupToken) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="authed-section" style={{ display: 'flex', flexDirection: getLayoutDirection() }}>
      <nav className="app-navigation rsborder rsbackground">
        <h4>{groupName}</h4>
        <Link to="/group/settings">
          <MenButton className={location.pathname.endsWith('/settings') ? 'active' : ''}>Settings</MenButton>
        </Link>
        <Link to="/setup-instructions">
          <MenButton>Setup</MenButton>
        </Link>
        <Link to="/logout">
          <MenButton>Logout</MenButton>
        </Link>
        <DonateButton />
      </nav>
      <main className="authed-section__main-content">{loading ? <p>Loading...</p> : <Outlet />}</main>
    </div>
  );
}
