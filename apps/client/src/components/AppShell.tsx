import { Link, NavLink, Outlet } from 'react-router-dom';
import { DonateButton } from './DonateButton.js';
import { OtherApps } from './OtherApps.js';
import { SocialLinks } from './SocialLinks.js';
import { useLogin } from '../state/LoginContext.js';
import { getLayoutDirection } from '../state/storage.js';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link active' : 'nav-link';
}

/** Persistent sidebar rendered on every route, authenticated or not - only the nav links inside
 * it change based on login state. Keeps every page feeling like part of the same app instead of
 * the authenticated area being the only one with real chrome. */
export function AppShell(): React.JSX.Element {
  const { loginName, isAuthenticated } = useLogin();

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: getLayoutDirection() }}>
      <nav className="app-navigation">
        <Link to="/" className="app-navigation__brand">
          <h4>{isAuthenticated ? loginName : 'OSRS MCP'}</h4>
        </Link>
        <div className="app-navigation__links">
          {isAuthenticated ? (
            <>
              <NavLink to="/manage/settings" className={navLinkClass}>
                Settings
              </NavLink>
              <NavLink to="/setup-instructions" className={navLinkClass}>
                Setup
              </NavLink>
              <NavLink to="/logout" className={navLinkClass}>
                Logout
              </NavLink>
            </>
          ) : (
            <>
              <NavLink to="/create-login" className={navLinkClass}>
                Get started
              </NavLink>
              <NavLink to="/login" className={navLinkClass}>
                Login
              </NavLink>
            </>
          )}
        </div>
        <OtherApps />
        <div className="app-navigation__lower">
          <SocialLinks />
          <DonateButton />
        </div>
      </nav>
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
