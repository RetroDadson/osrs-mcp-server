import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
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
 * the authenticated area being the only one with real chrome. Collapses to an off-canvas drawer
 * below 900px, closing automatically whenever the route changes. */
export function AppShell(): React.JSX.Element {
  const { loginName, isAuthenticated } = useLogin();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(location.pathname);
  const direction = getLayoutDirection();

  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname);
    setSidebarOpen(false);
  }

  const shellClassName = ['app-shell', direction === 'row-reverse' ? 'sidebar-right' : '', sidebarOpen ? 'sidebar-open' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClassName} style={{ display: 'flex', flexDirection: direction }}>
      <button
        type="button"
        className="sidebar-toggle"
        aria-controls="app-navigation"
        aria-expanded={sidebarOpen}
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        onClick={() => setSidebarOpen((open) => !open)}
      >
        {sidebarOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        )}
        <span>{sidebarOpen ? 'Close' : 'Menu'}</span>
      </button>
      <nav className="app-navigation" id="app-navigation">
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
      <button type="button" className="sidebar-backdrop" aria-label="Dismiss navigation overlay" onClick={() => setSidebarOpen(false)} />
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
