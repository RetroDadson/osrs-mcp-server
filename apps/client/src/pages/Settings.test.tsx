import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { getLayoutDirection, getTheme, storeLogin } from '../state/storage.js';
import { LoginLayout } from './LoginLayout.js';
import { Settings } from './Settings.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, getLoginData: vi.fn() };
});

function renderSettings(members: { name: string }[]) {
  vi.mocked(api.getLoginData).mockResolvedValue(members);
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
  it('renders one row per real member, excluding @SHARED', async () => {
    renderSettings([{ name: 'alice' }, { name: 'bob' }, { name: '@SHARED' }]);
    await waitFor(() => expect(screen.getByLabelText('Name of member 1')).toHaveValue('alice'));
    expect(screen.getByLabelText('Name of member 2')).toHaveValue('bob');
    expect(screen.queryByDisplayValue('@SHARED')).not.toBeInTheDocument();
  });

  it('shows an add-member row when under 5 members', async () => {
    renderSettings([{ name: 'alice' }]);
    await waitFor(() => expect(screen.getAllByText('Add')).toHaveLength(1));
  });

  it('hides the add-member row at 5 members', async () => {
    renderSettings([{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }]);
    expect(await screen.findByLabelText('Name of member 5')).toBeInTheDocument();
    expect(screen.queryByText('Add')).not.toBeInTheDocument();
  });

  it('changes and persists the theme setting', async () => {
    const user = userEvent.setup();
    renderSettings([{ name: 'alice' }]);
    expect(await screen.findByLabelText('Name of member 1')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dark'));
    expect(getTheme()).toBe('dark');

    await user.click(screen.getByLabelText('Light'));
    expect(getTheme()).toBe('light');
  });

  it('changes and persists the layout direction setting', async () => {
    const user = userEvent.setup();
    renderSettings([{ name: 'alice' }]);
    expect(await screen.findByLabelText('Name of member 1')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Right'));
    expect(getLayoutDirection()).toBe('row-reverse');

    await user.click(screen.getByLabelText('Left'));
    expect(getLayoutDirection()).toBe('row');
  });
});
