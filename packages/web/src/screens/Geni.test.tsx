import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderGeni, signIn } from './geniTestUtil';
import { emptyCriteria } from '../geni';

afterEach(() => vi.restoreAllMocks());

describe('Geni source step', () => {
  it('offers sign-in without a token', () => {
    renderGeni('/geni', { source: null });
    expect(screen.getByRole('button', { name: 'Sign in to Geni' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Source Title')).not.toBeInTheDocument();
  });

  it('ignores an expired token', () => {
    sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'TOK', expiresAt: Date.now() - 1 }));
    renderGeni('/geni', { source: null });
    expect(screen.getByRole('button', { name: 'Sign in to Geni' })).toBeInTheDocument();
  });

  it('shows the editable source and goes to the search on Next, keeping the edits', async () => {
    signIn();
    renderGeni('/geni', { source: null });
    expect(screen.getByLabelText('Source Title')).toHaveValue('DPLA');
    await userEvent.type(screen.getByLabelText(/Describe the Record/), 'my notes');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/geni-search');
    const saved = JSON.parse(sessionStorage.getItem('rs_geni_flow') ?? '{}') as { source: { title: string; notes: string; url: string } };
    expect(saved.source).toMatchObject({ title: 'DPLA', url: 'https://dp.la/' });
    expect(saved.source.notes).toContain('my notes');
  });

  it('restores earlier edits when coming back to modify the source', () => {
    signIn();
    renderGeni('/geni', { source: { title: 'Edited title', url: 'https://dp.la/x', citation: 'Edited cite', notes: 'Edited notes' } });
    expect(screen.getByLabelText('Source Title')).toHaveValue('Edited title');
    expect(screen.getByDisplayValue('Edited cite')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Edited notes')).toBeInTheDocument();
  });

  it('signs out and forgets the wizard state', async () => {
    signIn();
    renderGeni('/geni', { search: { ...emptyCriteria(), surname: 'Burke' } });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign in to Geni' })).toBeInTheDocument();
    expect(sessionStorage.getItem('rs_geni_token')).toBeNull();
  });

  it('later steps send you back here without a token', () => {
    renderGeni('/geni-search');
    expect(screen.getByTestId('where')).toHaveTextContent('/geni');
    expect(screen.getByTestId('where')).not.toHaveTextContent('search');
  });
});
