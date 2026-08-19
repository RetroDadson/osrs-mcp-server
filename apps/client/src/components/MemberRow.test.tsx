import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { storeGroup } from '../state/storage.js';
import { MemberRow } from './MemberRow.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
    renameGroupMember: vi.fn(),
    getGroupData: vi.fn().mockResolvedValue([]),
  };
});

describe('MemberRow', () => {
  beforeEach(() => {
    storeGroup('mygroup', 'mytoken');
  });

  it('renders an Add button when no member is given', () => {
    renderWithProviders(<MemberRow memberNumber={1} />);
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.queryByText('Rename')).not.toBeInTheDocument();
  });

  it('calls addGroupMember with the typed name', async () => {
    vi.mocked(api.addGroupMember).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<MemberRow memberNumber={1} />);

    await user.type(screen.getByLabelText('Name of member 1'), 'newmember');
    await user.click(screen.getByText('Add'));

    await waitFor(() => expect(api.addGroupMember).toHaveBeenCalledWith('mygroup', 'mytoken', 'newmember'));
  });

  it('renders Rename and Remove buttons for an existing member', () => {
    renderWithProviders(<MemberRow member="alice" memberNumber={1} />);
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('removes a member only after confirming the dialog', async () => {
    vi.mocked(api.removeGroupMember).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<MemberRow member="alice" memberNumber={1} />);

    await user.click(screen.getByText('Remove'));
    expect(api.removeGroupMember).not.toHaveBeenCalled();

    await user.click(screen.getByText('Yes'));
    await waitFor(() => expect(api.removeGroupMember).toHaveBeenCalledWith('mygroup', 'mytoken', 'alice'));
  });

  it('does not remove a member if the confirmation is declined', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemberRow member="alice" memberNumber={1} />);

    await user.click(screen.getByText('Remove'));
    await user.click(screen.getByText('No'));

    expect(api.removeGroupMember).not.toHaveBeenCalled();
  });

  it('surfaces an API error message', async () => {
    vi.mocked(api.addGroupMember).mockRejectedValue(new api.ApiError(400, 'Group is full'));
    const user = userEvent.setup();
    renderWithProviders(<MemberRow memberNumber={1} />);

    await user.type(screen.getByLabelText('Name of member 1'), 'newmember');
    await user.click(screen.getByText('Add'));

    expect(await screen.findByText('Group is full')).toBeInTheDocument();
  });
});
