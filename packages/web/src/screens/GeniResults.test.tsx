import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderGeni, signIn, BURKE } from './geniTestUtil';
import * as geni from '../geni';
import * as sentry from '../sentry';

const search = { ...geni.emptyCriteria(), givenName: 'Elizabeth', surname: 'Burke' };
const page = (over: Partial<geni.GeniSearchPage> = {}): geni.GeniSearchPage => ({
  profiles: [BURKE],
  returned: 1,
  total: 1,
  page: 1,
  hasNext: false,
  ...over,
});

beforeEach(signIn);
afterEach(() => vi.restoreAllMocks());

describe('GeniResults', () => {
  it('shows a card with life events, a link to geni.com and a thumbnail, and selects it', async () => {
    const thumb = { ...BURKE, thumb: 'https://media.geni.com/t.jpg' };
    const spy = vi.spyOn(geni, 'searchPeople').mockResolvedValue(page({ profiles: [thumb] }));
    const { container } = renderGeni('/geni-results', { search });
    expect(await screen.findByRole('link', { name: 'Elizabeth Burke' })).toHaveAttribute('href', BURKE.url);
    expect(spy).toHaveBeenCalledWith('TOK', search, 1);
    expect(screen.getByText(/Norfolk, Virginia/)).toBeInTheDocument();
    expect(container.querySelector('img.geni-thumb')).toHaveAttribute('src', 'https://media.geni.com/t.jpg');
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/geni-attach');
    expect(JSON.parse(sessionStorage.getItem('rs_geni_flow') ?? '{}').selected.id).toBe('profile-1');
  });

  it('pages: shows the range and fetches the next page', async () => {
    const spy = vi.spyOn(geni, 'searchPeople').mockResolvedValue(page({ total: 120, returned: 50, hasNext: true }));
    renderGeni('/geni-results', { search });
    expect(await screen.findByText(/1–50 of 120 results/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText(/51–100 of 120 results/);
    expect(spy).toHaveBeenLastCalledWith('TOK', search, 2);
  });

  it('says so when the extra details filtered everything out of the page', async () => {
    vi.spyOn(geni, 'searchPeople').mockResolvedValue(page({ profiles: [], returned: 50, total: 500 }));
    renderGeni('/geni-results', { search: { ...search, birthYear: '1500' } });
    expect(await screen.findByText(/found 50 people with that name on this page, but none match/)).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    vi.spyOn(geni, 'searchPeople').mockResolvedValue(page({ profiles: [], returned: 0, total: 0 }));
    renderGeni('/geni-results', { search });
    expect(await screen.findByText('No results found.')).toBeInTheDocument();
  });

  it('retries behind the Loading screen with no "busy, retrying" text', async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(geni, 'searchPeople').mockImplementation(async (_t, _s, _p, onBusy) => {
      calls++;
      onBusy?.(); // Geni answered busy; the real client would now wait and retry
      await gate;
      return page();
    });
    renderGeni('/geni-results', { search });
    expect(screen.getByRole('status')).toHaveTextContent('Searching Geni…');
    expect(screen.queryByText(/busy, retrying/i)).not.toBeInTheDocument();
    release();
    await screen.findByRole('link', { name: 'Elizabeth Burke' });
    expect(calls).toBe(1);
    expect(screen.queryByText(/busy, retrying/i)).not.toBeInTheDocument();
  });

  it('rate limit: friendly message, retry, and no error report', async () => {
    const report = vi.spyOn(sentry, 'reportError').mockImplementation(() => {});
    const spy = vi.spyOn(geni, 'searchPeople').mockRejectedValueOnce(new geni.GeniBusyError()).mockResolvedValue(page());
    renderGeni('/geni-results', { search });
    expect(await screen.findByRole('alert')).toHaveTextContent('Geni is busy right now');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Elizabeth Burke' })).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(report).not.toHaveBeenCalled();
  });

  it('reports an unexpected error', async () => {
    const report = vi.spyOn(sentry, 'reportError').mockImplementation(() => {});
    vi.spyOn(geni, 'searchPeople').mockRejectedValue(new geni.GeniError('Boom'));
    renderGeni('/geni-results', { search });
    expect(await screen.findByRole('alert')).toHaveTextContent('Geni said: Boom');
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('a refusal that mentions access is not mistaken for an expired sign-in', async () => {
    const report = vi.spyOn(sentry, 'reportError').mockImplementation(() => {});
    vi.spyOn(geni, 'searchPeople').mockRejectedValue(
      new geni.GeniError('Access denied: upgrade to Geni Pro', 'ApiException'),
    );
    renderGeni('/geni-results', { search });
    expect(await screen.findByRole('alert')).toHaveTextContent('Geni said: Access denied: upgrade to Geni Pro');
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('an expired sign-in is expected, not a bug', async () => {
    const report = vi.spyOn(sentry, 'reportError').mockImplementation(() => {});
    vi.spyOn(geni, 'searchPeople').mockRejectedValue(new geni.GeniError('Invalid access token'));
    renderGeni('/geni-results', { search });
    expect(await screen.findByRole('alert')).toHaveTextContent('sign-in has expired');
    expect(report).not.toHaveBeenCalled();
  });

  it('looks up a profile ID directly instead of searching', async () => {
    const lookup = vi.spyOn(geni, 'getProfile').mockResolvedValue(BURKE);
    const find = vi.spyOn(geni, 'searchPeople');
    renderGeni('/geni-results', { search: { ...geni.emptyCriteria(), pid: '6000000085123762838' } });
    expect(await screen.findByRole('link', { name: 'Elizabeth Burke' })).toBeInTheDocument();
    expect(lookup).toHaveBeenCalledWith('TOK', 'profile-g6000000085123762838', );
    expect(find).not.toHaveBeenCalled();
  });

  it('says when no profile has that ID', async () => {
    vi.spyOn(geni, 'getProfile').mockResolvedValue(null);
    renderGeni('/geni-results', { search: { ...geni.emptyCriteria(), pid: 'profile-1' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('No Geni profile found with ID profile-1');
  });

  it('Modify Search goes back', async () => {
    vi.spyOn(geni, 'searchPeople').mockResolvedValue(page());
    renderGeni('/geni-results', { search });
    await screen.findByRole('link', { name: 'Elizabeth Burke' });
    await userEvent.click(screen.getByRole('button', { name: 'Modify Search' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/geni-search');
  });
});
