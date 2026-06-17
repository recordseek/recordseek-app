import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Support } from './Support';

describe('Support', () => {
  it('shows the support contact', () => {
    render(<Support />);
    expect(screen.getByRole('heading', { name: /Get Support/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'me@dovy.io' })).toHaveAttribute(
      'href',
      'mailto:me@dovy.io?subject=RecordSeek',
    );
  });
});
