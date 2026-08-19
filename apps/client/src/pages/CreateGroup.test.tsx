import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { CreateGroup } from './CreateGroup.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    createGroup: vi.fn(),
    getCaptchaConfig: vi.fn(),
  };
});

describe('CreateGroup', () => {
  beforeEach(() => {
    vi.mocked(api.getCaptchaConfig).mockResolvedValue({ enabled: false, sitekey: '' });
  });

  it('defaults to a solo (1-member) group and shows exactly one member name field', async () => {
    renderWithProviders(<CreateGroup />, ['/create-group']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    expect(screen.getByLabelText('Name of member 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name of member 2')).not.toBeInTheDocument();
  });

  it('renders more member fields when the count select changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateGroup />, ['/create-group']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText('Number of members'), '3');
    expect(screen.getByLabelText('Name of member 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of member 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of member 3')).toBeInTheDocument();
  });

  it('rejects submission with an invalid group name without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateGroup />, ['/create-group']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Group name'), 'bad name!!');
    await user.type(screen.getByLabelText('Name of member 1'), 'alice');
    await user.click(screen.getByText('Create group'));

    expect(api.createGroup).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid group name.')).toBeInTheDocument();
  });

  it('rejects submission with an invalid member name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateGroup />, ['/create-group']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Group name'), 'mygroup');
    await user.type(screen.getByLabelText('Name of member 1'), 'bad@name');
    await user.click(screen.getByText('Create group'));

    expect(api.createGroup).not.toHaveBeenCalled();
    expect(screen.getByText('Every member name must be valid.')).toBeInTheDocument();
  });

  it('skips blank member name fields rather than rejecting them', async () => {
    vi.mocked(api.createGroup).mockResolvedValue({ name: 'mygroup', member_names: ['alice'], token: 't' });
    const user = userEvent.setup();
    renderWithProviders(<CreateGroup />, ['/create-group']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.selectOptions(screen.getByLabelText('Number of members'), '2');
    await user.type(screen.getByLabelText('Group name'), 'mygroup');
    await user.type(screen.getByLabelText('Name of member 1'), 'alice');
    // member 2 left blank
    await user.click(screen.getByText('Create group'));

    await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith('mygroup', ['alice'], ''));
  });

  it('blocks submission when captcha is enabled but not completed', async () => {
    vi.mocked(api.getCaptchaConfig).mockResolvedValue({ enabled: true, sitekey: 'site123' });
    const user = userEvent.setup();
    renderWithProviders(<CreateGroup />, ['/create-group']);
    await waitFor(() => expect(document.getElementById('hcaptcha-container')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Group name'), 'mygroup');
    await user.type(screen.getByLabelText('Name of member 1'), 'alice');
    await user.click(screen.getByText('Create group'));

    expect(api.createGroup).not.toHaveBeenCalled();
    expect(screen.getByText('Complete the captcha.')).toBeInTheDocument();
  });

  it('submits a valid solo group and navigates on success', async () => {
    vi.mocked(api.createGroup).mockResolvedValue({ name: 'mygroup', member_names: ['alice'], token: 'tok123' });
    const user = userEvent.setup();
    renderWithProviders(<CreateGroup />, ['/create-group']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Group name'), 'mygroup');
    await user.type(screen.getByLabelText('Name of member 1'), 'alice');
    await user.click(screen.getByText('Create group'));

    await waitFor(() => expect(api.createGroup).toHaveBeenCalledWith('mygroup', ['alice'], ''));
  });

  it('surfaces a server error message on failure', async () => {
    vi.mocked(api.createGroup).mockRejectedValue(new api.ApiError(400, 'Group name already taken'));
    const user = userEvent.setup();
    renderWithProviders(<CreateGroup />, ['/create-group']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Group name'), 'mygroup');
    await user.type(screen.getByLabelText('Name of member 1'), 'alice');
    await user.click(screen.getByText('Create group'));

    expect(await screen.findByText('Group name already taken')).toBeInTheDocument();
  });

  it('shows the hCaptcha widget when captcha is enabled', async () => {
    vi.mocked(api.getCaptchaConfig).mockResolvedValue({ enabled: true, sitekey: 'site123' });
    renderWithProviders(<CreateGroup />, ['/create-group']);

    await waitFor(() => expect(document.getElementById('hcaptcha-container')).toBeInTheDocument());
  });
});
