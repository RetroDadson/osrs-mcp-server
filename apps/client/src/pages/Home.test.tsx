import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { storeLogin } from '../state/storage.js';
import { renderWithProviders } from '../../tests/render.js';
import { Home } from './Home.js';

describe('Home', () => {
  it('shows a Login link when not authenticated', () => {
    renderWithProviders(<Home />);
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });

  it('shows a "Continue" link when a login is already stored', () => {
    storeLogin('mylogin', 'mytoken');
    renderWithProviders(<Home />);
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  it('always shows a "Get started" link', () => {
    renderWithProviders(<Home />);
    expect(screen.getByText('Get started')).toBeInTheDocument();
  });
});
