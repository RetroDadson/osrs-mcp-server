import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Link, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../tests/render.js';
import { setLayoutDirection, storeLogin } from '../state/storage.js';
import { AppShell } from './AppShell.js';

describe('AppShell', () => {
  it('shows Get started/Login and the OSRS MCP brand when not authenticated', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>page content</div>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByRole('heading', { level: 4, name: 'OSRS MCP' })).toBeInTheDocument();
    expect(screen.getByText('Get started')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('shows the login name and Settings/Setup/Logout when authenticated', () => {
    storeLogin('mylogin', 'mytoken');

    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>page content</div>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByRole('heading', { level: 4, name: 'mylogin' })).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
    expect(screen.queryByText('Get started')).not.toBeInTheDocument();
  });

  it('always renders the Other Apps link and Support button', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>page content</div>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByText('Other Apps')).toBeInTheDocument();
    expect(screen.getByText("Dadson's PS2 Challenge")).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('renders the routed page content via the outlet', () => {
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>page content</div>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('toggles the mobile sidebar open and closed via the toggle button', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>page content</div>} />
        </Route>
      </Routes>,
    );

    const openButton = screen.getByRole('button', { name: 'Open navigation' });
    expect(openButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Menu')).toBeInTheDocument();

    await user.click(openButton);
    const closeButton = screen.getByRole('button', { name: 'Close navigation' });
    expect(closeButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Close')).toBeInTheDocument();

    await user.click(closeButton);
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the sidebar when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>page content</div>} />
        </Route>
      </Routes>,
    );

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss navigation overlay'));
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });

  it('closes the sidebar automatically when the route changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              <div>
                page content
                <Link to="/other">Go</Link>
              </div>
            }
          />
          <Route path="/other" element={<div>other content</div>} />
        </Route>
      </Routes>,
    );

    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('button', { name: 'Close navigation' })).toBeInTheDocument();

    await user.click(screen.getByText('Go'));
    expect(await screen.findByText('other content')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open navigation' })).toBeInTheDocument();
  });

  it('marks the active nav link', () => {
    storeLogin('mylogin', 'mytoken');
    renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/setup-instructions" element={<div>setup page</div>} />
        </Route>
      </Routes>,
      ['/setup-instructions'],
    );

    expect(screen.getByText('Setup').closest('a')).toHaveClass('active');
    expect(screen.getByText('Settings').closest('a')).not.toHaveClass('active');
  });

  it('adds the sidebar-right class when the dock panel is set to the right', () => {
    setLayoutDirection('row-reverse');
    const { container } = renderWithProviders(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>page content</div>} />
        </Route>
      </Routes>,
    );

    expect(container.querySelector('.app-shell')).toHaveClass('sidebar-right');
  });
});
