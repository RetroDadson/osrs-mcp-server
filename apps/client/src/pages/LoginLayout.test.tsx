import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { getStoredLogin, storeLogin } from '../state/storage.js';
import { LoginLayout } from './LoginLayout.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, amILoggedIn: vi.fn() };
});

describe('LoginLayout', () => {
  it('redirects to login when no login is stored', () => {
    renderWithProviders(
      <Routes>
        <Route path="/manage" element={<LoginLayout />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
      ['/manage'],
    );
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('validates the stored token and renders the outlet once loading completes', async () => {
    storeLogin('mylogin', 'mytoken');
    vi.mocked(api.amILoggedIn).mockResolvedValue('mylogin');

    renderWithProviders(
      <Routes>
        <Route path="/manage" element={<LoginLayout />}>
          <Route index element={<div>Login content</div>} />
        </Route>
      </Routes>,
      ['/manage'],
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(await screen.findByText('Login content')).toBeInTheDocument();
  });

  it('logs out and redirects to login when the stored token is no longer valid', async () => {
    storeLogin('mylogin', 'mytoken');
    vi.mocked(api.amILoggedIn).mockResolvedValue(null);

    renderWithProviders(
      <Routes>
        <Route path="/manage" element={<LoginLayout />}>
          <Route index element={<div>Login content</div>} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
      ['/manage'],
    );

    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(getStoredLogin()).toEqual({ loginName: null, token: null });
  });
});
