import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../tests/render.js';
import { storeLogin } from '../state/storage.js';
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
});
