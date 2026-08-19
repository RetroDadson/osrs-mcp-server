import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LabeledInput } from './LabeledInput.js';

describe('LabeledInput', () => {
  it('renders a labeled input with no error initially', () => {
    render(<LabeledInput id="x" label="X label" />);
    expect(screen.getByLabelText('X label')).toBeInTheDocument();
    expect(screen.queryByText(/./, { selector: '.validation-error' })).not.toBeInTheDocument();
  });

  it('shows a validation error on blur when validate returns a message', async () => {
    const user = userEvent.setup();
    render(<LabeledInput id="x" label="X label" validate={() => 'Bad value'} />);

    await user.click(screen.getByLabelText('X label'));
    await user.tab();

    expect(screen.getByText('Bad value')).toBeInTheDocument();
    expect(screen.getByLabelText('X label')).toHaveClass('invalid');
  });

  it('clears the error once the value becomes valid', async () => {
    const user = userEvent.setup();
    let valid = false;
    render(<LabeledInput id="x" label="X label" validate={() => (valid ? null : 'Bad value')} />);

    const input = screen.getByLabelText('X label');
    await user.click(input);
    await user.tab();
    expect(screen.getByText('Bad value')).toBeInTheDocument();

    valid = true;
    await user.click(input);
    await user.tab();
    expect(screen.queryByText('Bad value')).not.toBeInTheDocument();
  });
});
