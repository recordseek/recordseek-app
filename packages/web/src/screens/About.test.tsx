import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { About } from './About';

describe('About', () => {
  it('tells the founder story and links contact', () => {
    render(<About />);
    expect(screen.getByText(/in a few weeks RecordSeek was created/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'me@dovy.io' })).toHaveAttribute(
      'href',
      'mailto:me@dovy.io?subject=RecordSeek',
    );
  });
});
