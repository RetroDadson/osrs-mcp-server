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

  it('shows only the player name field', async () => {
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    expect(screen.getByLabelText('Your OSRS name')).toBeInTheDocument();
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

  it('submits a valid login and navigates on success', async () => {
    vi.mocked(api.createLogin).mockResolvedValue({ login_name: 'myname', token: 'tok123' });
    const user = userEvent.setup();
    renderWithProviders(<CreateLogin />, ['/create-login']);
    await waitFor(() => expect(api.getCaptchaConfig).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Your OSRS name'), 'myname');
    await user.click(screen.getByText('Create login'));

    await waitFor(() => expect(api.createLogin).toHaveBeenCalledWith('myname', ''));
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
