import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderGeni, signIn } from './geniTestUtil';
import { emptyCriteria } from '../geni';
import { stubRedirect } from '../test/redirect';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Geni source step', () => {
  it('redirects to Geni at once without a token, showing the Loading screen', () => {
    const assign = stubRedirect();
    renderGeni('/geni', { source: null });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(String(assign.mock.calls[0]?.[0])).toContain('geni.com');
    expect(screen.getByRole('status')).toHaveTextContent('Signing in to Geni…');
    expect(screen.queryByLabelText('Source Title')).not.toBeInTheDocument();
  });

  it('redirects on an expired token', () => {
    const assign = stubRedirect();
    sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'TOK', expiresAt: Date.now() - 1 }));
    renderGeni('/geni', { source: null });
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('does not redirect again after a failed return: shows Try again', async () => {
    const assign = stubRedirect();
    sessionStorage.setItem('rs_auth_attempted_geni', '1');
    renderGeni('/geni', { source: null });
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Geni sign-in didn’t finish');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('clears the attempt marker once signed in', () => {
    sessionStorage.setItem('rs_auth_attempted_geni', '1');
    signIn();
    renderGeni('/geni', { source: null });
    expect(sessionStorage.getItem('rs_auth_attempted_geni')).toBeNull();
    expect(screen.getByLabelText('Source Title')).toBeInTheDocument();
  });

  it('shows the editable source and goes to the search on Next, keeping the edits', async () => {
    signIn();
    renderGeni('/geni', { source: null });
    expect(screen.getByLabelText('Source Title')).toHaveValue('DPLA');
    await userEvent.type(screen.getByLabelText(/Describe the Record/), 'my notes');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/geni-search');
    const saved = JSON.parse(sessionStorage.getItem('rs_geni_flow') ?? '{}') as {
      source: { title: string; notes: string; url: string };
    };
    expect(saved.source).toMatchObject({ title: 'DPLA', url: 'https://dp.la/' });
    expect(saved.source.notes).toContain('my notes');
  });

  it('restores earlier edits when coming back to modify the source', () => {
    signIn();
    renderGeni('/geni', {
      source: { title: 'Edited title', url: 'https://dp.la/x', citation: 'Edited cite', notes: 'Edited notes' },
    });
    expect(screen.getByLabelText('Source Title')).toHaveValue('Edited title');
    expect(screen.getByDisplayValue('Edited cite')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Edited notes')).toBeInTheDocument();
  });

  it('later steps send you back here without a token', () => {
    renderGeni('/geni-search');
    expect(screen.getByTestId('where')).toHaveTextContent('/geni');
    expect(screen.getByTestId('where')).not.toHaveTextContent('search');
  });
});
