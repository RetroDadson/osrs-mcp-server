import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { storeGroup } from '../state/storage.js';
import { renderWithProviders } from '../../tests/render.js';
import { Home } from './Home.js';

describe('Home', () => {
  it('shows a Login link when not authenticated', () => {
    renderWithProviders(<Home />);
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByText('Go to group')).not.toBeInTheDocument();
  });

  it('shows a "Go to group" link when a group is already stored', () => {
    storeGroup('mygroup', 'mytoken');
    renderWithProviders(<Home />);
    expect(screen.getByText('Go to group')).toBeInTheDocument();
  });

  it('always shows a "Get started" link', () => {
    renderWithProviders(<Home />);
    expect(screen.getByText('Get started')).toBeInTheDocument();
  });
});
