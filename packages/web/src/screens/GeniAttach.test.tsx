import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderGeni, signIn, BURKE, SOURCE } from './geniTestUtil';
import * as geni from '../geni';
import * as sentry from '../sentry';

const SPOUSE = { id: 'profile-2', name: 'John Burke', years: '1710 – 1765', url: '' };
const KID = { id: 'profile-3', name: 'Mary Burke', years: '1740 – ', url: '' };
const FAMILY = { parents: [], spouses: [SPOUSE], children: [KID], siblings: [] };
const DOC = (over: Partial<geni.GeniDocument> = {}): geni.GeniDocument => ({
  id: 'document-5',
  url: 'https://www.geni.com/documents/view?doc_id=5',
  tagged: true,
  taggedIds: ['profile-1'],
  failedIds: [],
  ...over,
});

beforeEach(() => {
  signIn();
  vi.spyOn(geni, 'immediateFamily').mockResolvedValue(FAMILY);
});
afterEach(() => vi.restoreAllMocks());

describe('GeniAttach', () => {
  it('shows the person and the source, and falls back to search without a person', async () => {
    renderGeni('/geni-attach', { selected: BURKE });
    expect(screen.getByRole('status')).toHaveTextContent('Loading their family from Geni…');
    expect(await screen.findByRole('link', { name: 'Elizabeth Burke' })).toHaveAttribute('href', BURKE.url);
    expect(screen.getByText(/Source: "DPLA"/)).toBeInTheDocument();
    await screen.findByLabelText(/John Burke/);
  });

  it('redirects to search with no person selected', () => {
    renderGeni('/geni-attach');
    expect(screen.getByTestId('where')).toHaveTextContent('/geni-search');
  });

  it('saves to just the person and lands on complete', async () => {
    const add = vi.spyOn(geni, 'addDocument').mockResolvedValue(DOC());
    renderGeni('/geni-attach', { selected: BURKE });
    await screen.findByLabelText(/John Burke/);
    await userEvent.click(screen.getByRole('button', { name: 'Save & Attach' }));
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'TOK',
        title: 'DPLA',
        text: 'DPLA cite\n\nmy notes\n\nhttps://dp.la/',
        sourceUrl: SOURCE.url,
        profileIds: ['profile-1'],
      }),
    );
    expect(await screen.findByTestId('where')).toHaveTextContent('/geni-complete');
  });

  it('tags the person plus every checked relative, person first', async () => {
    const add = vi.spyOn(geni, 'addDocument').mockResolvedValue(DOC({ taggedIds: ['profile-1', 'profile-2', 'profile-3'] }));
    renderGeni('/geni-attach', { selected: BURKE });
    await userEvent.click(await screen.findByLabelText(/Mary Burke/));
    await userEvent.click(screen.getByLabelText(/John Burke/));
    await userEvent.click(screen.getByRole('button', { name: 'Save & Tag 3 People' }));
    expect(add.mock.calls[0]?.[0].profileIds).toEqual(['profile-1', 'profile-2', 'profile-3']);
    expect(JSON.parse(sessionStorage.getItem('rs_geni_flow') ?? '{}').saved.people).toHaveLength(3);
  });

  it('still saves when the family cannot load', async () => {
    vi.spyOn(geni, 'immediateFamily').mockRejectedValue(new geni.GeniBusyError());
    const add = vi.spyOn(geni, 'addDocument').mockResolvedValue(DOC());
    renderGeni('/geni-attach', { selected: BURKE });
    expect(await screen.findByText(/Couldn’t load their family/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save & Attach' }));
    expect(add).toHaveBeenCalled();
  });

  it('shows a rate limit without reporting a bug, and lets you retry', async () => {
    const report = vi.spyOn(sentry, 'reportError').mockImplementation(() => {});
    vi.spyOn(geni, 'addDocument').mockRejectedValue(new geni.GeniBusyError());
    renderGeni('/geni-attach', { selected: BURKE });
    await userEvent.click(await screen.findByRole('button', { name: 'Save & Attach' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Geni is busy right now');
    expect(screen.getByRole('button', { name: 'Save & Attach' })).toBeEnabled();
    expect(report).not.toHaveBeenCalled();
  });

  it('reports an unexpected save failure', async () => {
    const report = vi.spyOn(sentry, 'reportError').mockImplementation(() => {});
    vi.spyOn(geni, 'addDocument').mockRejectedValue(new geni.GeniError('Geni returned no document'));
    renderGeni('/geni-attach', { selected: BURKE });
    await userEvent.click(await screen.findByRole('button', { name: 'Save & Attach' }));
    await screen.findByRole('alert');
    expect(report).toHaveBeenCalledTimes(1);
  });
});
