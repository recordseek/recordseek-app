import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { WikiTree } from './WikiTree';

const HREF = 'http://localhost:9000/?_=1781642252441&url=https%3A%2F%2Fdp.la%2F&title=Digital%20Public%20Library%20of%20America';

function renderScreen() {
  return render(
    <CaptureProvider href={HREF}>
      <MemoryRouter initialEntries={['/wikitree']}>
        <Routes>
          <Route path="/wikitree" element={<WikiTree />} />
          <Route path="/" element={<div>MAIN</div>} />
        </Routes>
      </MemoryRouter>
    </CaptureProvider>,
  );
}

const raw = (n: number, first: string) => ({ Id: n, Name: `Smith-${n}`, FirstName: first, LastNameAtBirth: 'Smith', BirthDate: '1850-00-00' });

describe('WikiTree', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('shows a ref block with the wiki link', () => {
    renderScreen();
    const ref = (screen.getByLabelText('Reference') as HTMLTextAreaElement).value;
    expect(ref).toMatch(/^<ref>.*\[https:\/\/dp\.la\/ Digital Public Library of America\]<\/ref>$/);
  });

  it('copies the reference', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Copy reference' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^<ref>/));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
  });

  it('rejects a bad ID and opens the edit page for a good one', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderScreen();
    await userEvent.type(screen.getByLabelText('WikiTree ID'), 'Smith');
    await userEvent.click(screen.getByRole('button', { name: 'Open the edit page' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('WikiTree ID'), '-123');
    await userEvent.click(screen.getByRole('button', { name: 'Open the edit page' }));
    expect(open).toHaveBeenCalledWith('https://www.wikitree.com/index.php?title=Special:EditPerson&w=Smith-123', '_blank', 'noopener');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    open.mockRestore();
  });

  it('goes back to the picker', async () => {
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: /Go Back/ }));
    expect(screen.getByText('MAIN')).toBeInTheDocument();
  });

  it('offers sign-in when signed out', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Sign in to WikiTree' })).toBeInTheDocument();
    expect(screen.getByText(/Not on your watchlist\? Enter an ID/)).toBeInTheDocument();
  });

  it('confirms the authcode, lists the watchlist, filters and picks', async () => {
    sessionStorage.setItem('rs_wikitree_authcode', 'code');
    const fetchMock = vi.fn(async (_url: string, init: { body: URLSearchParams }) => {
      const action = init.body.get('action');
      const data =
        action === 'clientLogin'
          ? { clientLogin: { result: 'Success', username: 'Smith-1', userid: 1 }, session: 'c=1' }
          : [{ status: 0, watchlistCount: 2, watchlist: [raw(1, 'Ann'), raw(2, 'Bob')] }];
      return { ok: true, status: 200, json: async () => data };
    });
    vi.stubGlobal('fetch', fetchMock);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    renderScreen();
    expect(await screen.findByText('Ann Smith', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('Bob Smith', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Signed in as/)).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText(/Filter by name/), 'bob');
    expect(screen.queryByText('Ann Smith', { exact: false })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio'));
    await userEvent.click(screen.getByRole('button', { name: 'Open Smith-2 to paste' }));
    expect(open).toHaveBeenCalledWith('https://www.wikitree.com/index.php?title=Special:EditPerson&w=Smith-2', '_blank', 'noopener');
    open.mockRestore();
  });

  it('asks to sign in again when the session has ended', async () => {
    sessionStorage.setItem('rs_wikitree_session', JSON.stringify({ session: 'old', userName: 'Smith-1', userId: 1 }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ status: 'Access denied' }] })));
    renderScreen();
    expect(await screen.findByRole('alert')).toHaveTextContent(/sign in again/i);
    expect(screen.getByRole('button', { name: 'Sign in to WikiTree' })).toBeInTheDocument();
  });
});
