import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import { getStoredLogin, storeLogin } from '../state/storage.js';
import { Logout } from './Logout.js';

describe('Logout', () => {
  it('clears stored credentials on mount', () => {
    storeLogin('mylogin', 'mytoken');
    renderWithProviders(<Logout />, ['/logout']);
    expect(getStoredLogin()).toEqual({ loginName: null, token: null });
  });
});
