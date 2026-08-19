import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { storeGroup } from '../state/storage.js';
import { GroupLayout } from './GroupLayout.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return { ...actual, getGroupData: vi.fn() };
});

describe('GroupLayout', () => {
  it('redirects to login when no group is stored', () => {
    renderWithProviders(
      <Routes>
        <Route path="/group" element={<GroupLayout />} />
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
      ['/group'],
    );
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('loads members and renders the nav with the group name', async () => {
    storeGroup('mygroup', 'mytoken');
    vi.mocked(api.getGroupData).mockResolvedValue([{ name: 'alice' }, { name: '@SHARED' }]);

    renderWithProviders(
      <Routes>
        <Route path="/group" element={<GroupLayout />}>
          <Route index element={<div>Group content</div>} />
        </Route>
      </Routes>,
      ['/group'],
    );

    expect(screen.getByText('mygroup')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Group content')).toBeInTheDocument());
  });
});
