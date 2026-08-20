import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { getStoredLogin } from '../state/storage.js';
import { Login } from './Login.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, amILoggedIn: vi.fn() };
});

describe('Login', () => {
  it('shows an error for an incorrect token', async () => {
    vi.mocked(api.amILoggedIn).mockResolvedValue(null);
    const user = userEvent.setup();
    renderWithProviders(<Login />, ['/login']);

    await user.type(screen.getByLabelText('Token'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Token is incorrect.')).toBeInTheDocument();
  });

  it('stores credentials on a successful login', async () => {
    vi.mocked(api.amILoggedIn).mockResolvedValue('mylogin');
    const user = userEvent.setup();
    renderWithProviders(<Login />, ['/login']);

    await user.type(screen.getByLabelText('Token'), 'right-token');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(getStoredLogin()).toEqual({ loginName: 'mylogin', token: 'right-token' }));
  });
});
