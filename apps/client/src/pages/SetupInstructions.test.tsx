import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import { storeLogin } from '../state/storage.js';
import { SetupInstructions } from './SetupInstructions.js';

describe('SetupInstructions', () => {
  it('redirects to create-login when no login is stored', () => {
    renderWithProviders(<SetupInstructions />, ['/setup-instructions']);
    expect(screen.queryByText('Setup instructions')).not.toBeInTheDocument();
  });

  it('shows the login name and hides the token behind a reveal button', async () => {
    storeLogin('mylogin', 'super-secret-token');
    const user = userEvent.setup();
    renderWithProviders(<SetupInstructions />, ['/setup-instructions']);

    expect(screen.getByText('mylogin')).toBeInTheDocument();
    expect(screen.queryByText('super-secret-token')).not.toBeInTheDocument();

    await user.click(screen.getByText('Click to show'));
    expect(screen.getByText('super-secret-token')).toBeInTheDocument();
  });
});
