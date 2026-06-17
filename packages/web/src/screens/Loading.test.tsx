import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Loading } from './Loading';

describe('Loading', () => {
  it('shows a provided status', () => {
    render(<Loading status="Authenticating, please wait." />);
    expect(screen.getByRole('status')).toHaveTextContent('Authenticating, please wait.');
  });

  it('defaults to a loading message', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
});
