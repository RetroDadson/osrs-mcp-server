import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { storeLogin } from '../state/storage.js';
import { SetupInstructions } from './SetupInstructions.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, getSyncStatus: vi.fn() };
});

describe('SetupInstructions', () => {
  it('redirects to create-login when no login is stored', () => {
    renderWithProviders(<SetupInstructions />, ['/setup-instructions']);
    expect(screen.queryByText('Setup instructions')).not.toBeInTheDocument();
  });

  it('shows the login name and hides the token behind a reveal button', async () => {
    vi.mocked(api.getSyncStatus).mockResolvedValue({ lastUpdated: undefined });
    storeLogin('mylogin', 'super-secret-token');
    const user = userEvent.setup();
    renderWithProviders(<SetupInstructions />, ['/setup-instructions']);

    expect(screen.getByText('mylogin')).toBeInTheDocument();
    expect(screen.queryByText('super-secret-token')).not.toBeInTheDocument();

    await user.click(screen.getByText('Click to show'));
    expect(screen.getByText('super-secret-token')).toBeInTheDocument();
  });

  it('shows the live connection status', async () => {
    vi.mocked(api.getSyncStatus).mockResolvedValue({ lastUpdated: '2026-01-01T12:00:00.000Z' });
    storeLogin('mylogin', 'super-secret-token');
    renderWithProviders(<SetupInstructions />, ['/setup-instructions']);

    expect(await screen.findByText(/Last synced/)).toBeInTheDocument();
  });
});
