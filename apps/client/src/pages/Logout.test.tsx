import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../tests/render.js';
import { getStoredGroup, storeGroup } from '../state/storage.js';
import { Logout } from './Logout.js';

describe('Logout', () => {
  it('clears stored credentials on mount', () => {
    storeGroup('mygroup', 'mytoken');
    renderWithProviders(<Logout />, ['/logout']);
    expect(getStoredGroup()).toEqual({ groupName: null, groupToken: null });
  });
});
