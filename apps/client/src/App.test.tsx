import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('App', () => {
  it('renders the home page at the root route', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'OSRS MCP' })).toBeInTheDocument();
  });
});
