import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackButton } from './BackButton';

describe('BackButton', () => {
  it('renders a "Go Back" button (with the arrow hidden from a11y) and fires onClick', async () => {
    const onClick = vi.fn();
    render(<BackButton onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Go Back' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('supports a custom label', () => {
    render(<BackButton onClick={() => {}}>Modify Search</BackButton>);
    expect(screen.getByRole('button', { name: 'Modify Search' })).toBeInTheDocument();
  });
});
