import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { getLayoutDirection, storeLogin } from '../state/storage.js';
import { LoginLayout } from './LoginLayout.js';
import { Settings } from './Settings.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, amILoggedIn: vi.fn(), renameLogin: vi.fn() };
});

function renderSettings() {
  vi.mocked(api.amILoggedIn).mockResolvedValue('mylogin');
  storeLogin('mylogin', 'mytoken');
  return renderWithProviders(
    <Routes>
      <Route path="/manage" element={<LoginLayout />}>
        <Route index element={<Settings />} />
      </Route>
    </Routes>,
    ['/manage'],
  );
}

describe('Settings', () => {
  it('shows the current login name in the rename field', async () => {
    renderSettings();
    await waitFor(() => expect(screen.getByLabelText('Your OSRS name')).toHaveValue('mylogin'));
  });

  it('renames the login and updates the stored name', async () => {
    vi.mocked(api.renameLogin).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(screen.getByLabelText('Your OSRS name')).toHaveValue('mylogin'));

    await user.clear(screen.getByLabelText('Your OSRS name'));
    await user.type(screen.getByLabelText('Your OSRS name'), 'newname');
    await user.click(screen.getByText('Rename'));

    await waitFor(() => expect(api.renameLogin).toHaveBeenCalledWith('mytoken', 'newname'));
  });

  it('changes and persists the layout direction setting', async () => {
    const user = userEvent.setup();
    renderSettings();
    await waitFor(() => expect(screen.getByLabelText('Your OSRS name')).toHaveValue('mylogin'));

    await user.click(screen.getByLabelText('Right'));
    expect(getLayoutDirection()).toBe('row-reverse');
  });
});
