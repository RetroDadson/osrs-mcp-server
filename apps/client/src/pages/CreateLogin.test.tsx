import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import * as api from '../api/client.js';
import { CreateLogin } from './CreateLogin.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual<typeof import('../api/client.js')>('../api/client.js');
  return {
    ...actual,
    createLogin: vi.fn(),
    getCaptchaConfig: vi.fn(),
  };
});

describe('CreateLogin', () => {
  beforeEach(() => {
    vi.mocked(api.getCaptchaConfig).mockResolvedValue({ enabled: false, sitekey: '' });
  });

  it('shows only the player name field by default, with no member fields visible', async () => {
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    expect(screen.getByLabelText('Your OSRS name')).toBeInTheDocument();
    expect(screen.queryByLabelText('Login name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name of person 2')).not.toBeInTheDocument();
  });

  it('reveals the login name field and member fields when "Add others" is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.click(screen.getByText('+ Add others to share this'));
    expect(screen.getByLabelText('Login name')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of person 2')).toBeInTheDocument();
  });

  it('renders more member fields when the other-count select changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.click(screen.getByText('+ Add others to share this'));
    await user.selectOptions(screen.getByLabelText('Number of other players'), '3');
    expect(screen.getByLabelText('Name of person 2')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of person 3')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of person 4')).toBeInTheDocument();
  });

  it('rejects submission with an invalid player name without calling the API', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Your OSRS name'), 'bad name!!');
    await user.click(screen.getByText('Create login'));

    expect(api.createLogin).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid name.')).toBeInTheDocument();
  });

  it('rejects submission with an invalid member name', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Your OSRS name'), 'myname');
    await user.click(screen.getByText('+ Add others to share this'));
    await user.type(screen.getByLabelText('Name of person 2'), 'bad@name');
    await user.click(screen.getByText('Create login'));

    expect(api.createLogin).not.toHaveBeenCalled();
    expect(screen.getByText('Every member name must be valid.')).toBeInTheDocument();
  });

  it('skips blank member name fields rather than rejecting them', async () => {
    vi.mocked(api.createLogin).mockResolvedValue({ login_name: 'myname', member_names: ['myname', 'alice'], token: 't' });
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Your OSRS name'), 'myname');
    await user.click(screen.getByText('+ Add others to share this'));
    await user.selectOptions(screen.getByLabelText('Number of other players'), '2');
    await user.type(screen.getByLabelText('Name of person 2'), 'alice');
    // person 3 left blank
    await user.click(screen.getByText('Create login'));

    await waitFor(() => expect(api.createLogin).toHaveBeenCalledWith('myname', ['myname', 'alice'], ''));
  });

  it('uses a custom login name when provided, alongside the player as a member', async () => {
    vi.mocked(api.createLogin).mockResolvedValue({ login_name: 'sharedlogin', member_names: ['myname', 'alice'], token: 't' });
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Your OSRS name'), 'myname');
    await user.click(screen.getByText('+ Add others to share this'));
    await user.type(screen.getByLabelText('Login name'), 'sharedlogin');
    await user.type(screen.getByLabelText('Name of person 2'), 'alice');
    await user.click(screen.getByText('Create login'));

    await waitFor(() => expect(api.createLogin).toHaveBeenCalledWith('sharedlogin', ['myname', 'alice'], ''));
  });

  it('blocks submission when captcha is enabled but not completed', async () => {
    vi.mocked(api.getCaptchaConfig).mockResolvedValue({ enabled: true, sitekey: 'site123' });
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(document.getElementById('hcaptcha-container')).toBeInTheDocument());

    await user.type(screen.getByLabelText('Your OSRS name'), 'myname');
    await user.click(screen.getByText('Create login'));

    expect(api.createLogin).not.toHaveBeenCalled();
    expect(screen.getByText('Complete the captcha.')).toBeInTheDocument();
  });

  it('submits a valid solo login and navigates on success', async () => {
    vi.mocked(api.createLogin).mockResolvedValue({ login_name: 'myname', member_names: ['myname'], token: 'tok123' });
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Your OSRS name'), 'myname');
    await user.click(screen.getByText('Create login'));

    await waitFor(() => expect(api.createLogin).toHaveBeenCalledWith('myname', ['myname'], ''));
  });

  it('surfaces a server error message on failure', async () => {
    vi.mocked(api.createLogin).mockRejectedValue(new api.ApiError(400, 'Login name already taken'));
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Your OSRS name'), 'myname');
    await user.click(screen.getByText('Create login'));

    expect(await screen.findByText('Login name already taken')).toBeInTheDocument();
  });

  it('shows the hCaptcha widget when captcha is enabled', async () => {
    vi.mocked(api.getCaptchaConfig).mockResolvedValue({ enabled: true, sitekey: 'site123' });
    renderWithProviders(<CreateLogin />, ['/create-login']);

    await waitFor(() => expect(document.getElementById('hcaptcha-container')).toBeInTheDocument());
  });
});
