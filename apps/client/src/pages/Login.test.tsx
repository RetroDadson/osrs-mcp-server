import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { getStoredGroup } from '../state/storage.js';
import { Login } from './Login.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, amILoggedIn: vi.fn() };
});

describe('Login', () => {
  it('shows an error for an incorrect group/token combination', async () => {
    vi.mocked(api.amILoggedIn).mockResolvedValue(false);
    const user = userEvent.setup();
    renderWithProviders(<Login />, ['/login']);

    await user.type(screen.getByLabelText('Group name'), 'mygroup');
    await user.type(screen.getByLabelText('Group token'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Group name or token is incorrect.')).toBeInTheDocument();
  });

  it('stores credentials on a successful login', async () => {
    vi.mocked(api.amILoggedIn).mockResolvedValue(true);
    const user = userEvent.setup();
    renderWithProviders(<Login />, ['/login']);

    await user.type(screen.getByLabelText('Group name'), 'mygroup');
    await user.type(screen.getByLabelText('Group token'), 'right-token');
    await user.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(getStoredGroup()).toEqual({ groupName: 'mygroup', groupToken: 'right-token' }));
  });
});
