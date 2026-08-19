import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MenButton } from './MenButton.js';

describe('MenButton', () => {
  it('renders its children and calls onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<MenButton onClick={onClick}>Click me</MenButton>);

    await user.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the small class when small is set', () => {
    render(<MenButton small>Small</MenButton>);
    expect(screen.getByText('Small')).toHaveClass('small');
  });

  it('is disabled when the disabled prop is set', () => {
    render(<MenButton disabled>Disabled</MenButton>);
    expect(screen.getByText('Disabled')).toBeDisabled();
  });
});
