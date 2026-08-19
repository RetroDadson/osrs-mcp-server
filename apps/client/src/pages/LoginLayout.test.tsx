import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { storeLogin } from '../state/storage.js';
import { LoginLayout } from './LoginLayout.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, getLoginData: vi.fn() };
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

  it('loads members and renders the nav with the login name', async () => {
    storeLogin('mylogin', 'mytoken');
    vi.mocked(api.getLoginData).mockResolvedValue([{ name: 'alice' }, { name: '@SHARED' }]);

    renderWithProviders(
      <Routes>
        <Route path="/manage" element={<LoginLayout />}>
          <Route index element={<div>Login content</div>} />
        </Route>
      </Routes>,
      ['/manage'],
    );

    expect(screen.getByText('mylogin')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Login content')).toBeInTheDocument());
  });
});
