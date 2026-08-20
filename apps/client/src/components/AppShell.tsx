import { Link, Outlet, useLocation } from 'react-router-dom';
import { DonateButton } from './DonateButton.js';
import { MenButton } from './MenButton.js';
import { OtherApps } from './OtherApps.js';
import { SocialLinks } from './SocialLinks.js';
import { useLogin } from '../state/LoginContext.js';
import { getLayoutDirection } from '../state/storage.js';

/** Persistent sidebar rendered on every route, authenticated or not - only the nav links inside
 * it change based on login state. Keeps every page feeling like part of the same app instead of
 * the authenticated area being the only one with real chrome. */
export function AppShell(): React.JSX.Element {
  const { loginName, isAuthenticated } = useLogin();
  const location = useLocation();

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: getLayoutDirection() }}>
      <nav className="app-navigation">
        <Link to="/" className="app-navigation__brand">
          <h4>{isAuthenticated ? loginName : 'OSRS MCP'}</h4>
        </Link>
        {isAuthenticated ? (
          <>
            <Link to="/manage/settings">
              <MenButton className={location.pathname.endsWith('/settings') ? 'active' : ''}>Settings</MenButton>
            </Link>
            <Link to="/setup-instructions">
              <MenButton>Setup</MenButton>
            </Link>
            <Link to="/logout">
              <MenButton>Logout</MenButton>
            </Link>
          </>
        ) : (
          <>
            <Link to="/create-login">
              <MenButton>Get started</MenButton>
            </Link>
            <Link to="/login">
              <MenButton>Login</MenButton>
            </Link>
          </>
        )}
        <SocialLinks />
        <OtherApps />
        <DonateButton />
      </nav>
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
