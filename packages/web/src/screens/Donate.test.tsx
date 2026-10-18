import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Donate } from './Donate';

describe('Donate', () => {
  it('shows the creator photo and links to PayPal in a new tab', () => {
    render(<Donate />);
    expect(screen.getByRole('img', { name: 'Dovy Paukstys' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Donate with PayPal' });
    expect(link).toHaveAttribute('href', 'https://paypal.me/dovyp');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
