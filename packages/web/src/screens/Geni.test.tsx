import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { Geni } from './Geni';
import * as geni from '../geni';

const HREF = 'http://localhost:9000/?_=1781642252441&url=https%3A%2F%2Fdp.la%2F&title=DPLA';

function renderScreen() {
  return render(
    <CaptureProvider href={HREF}>
      <MemoryRouter initialEntries={['/geni']}>
        <Routes>
          <Route path="/geni" element={<Geni />} />
          <Route path="/" element={<div>MAIN</div>} />
        </Routes>
      </MemoryRouter>
    </CaptureProvider>,
  );
}

function signedIn(): void {
  sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'TOK', expiresAt: Date.now() + 60000 }));
}

const BURKE: geni.GeniProfile = { id: 'profile-1', name: 'Elizabeth Burke', years: '1712 – 1770', url: '' };

afterEach(() => vi.restoreAllMocks());

describe('Geni', () => {
  it('offers sign-in without a token', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Sign in to Geni' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Find a profile')).not.toBeInTheDocument();
  });

  it('ignores an expired token', () => {
    sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'TOK', expiresAt: Date.now() - 1 }));
    renderScreen();
    expect(screen.getByRole('button', { name: 'Sign in to Geni' })).toBeInTheDocument();
  });

  it('searches, previews the citation, saves, and links to the document', async () => {
    signedIn();
    const search = vi.spyOn(geni, 'searchProfiles').mockResolvedValue([BURKE]);
    const add = vi.spyOn(geni, 'addDocument').mockResolvedValue({ id: 'document-5', url: 'https://www.geni.com/documents/view?doc_id=5', tagged: true });
    renderScreen();
    await userEvent.type(screen.getByLabelText('Find a profile'), 'burke');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(search).toHaveBeenCalledWith('TOK', 'burke', expect.any(Function));
    await userEvent.click(await screen.findByRole('radio', { name: /Elizabeth Burke/ }));
    expect((screen.getByLabelText('Document text') as HTMLTextAreaElement).value).toMatch(/DPLA[\s\S]*\n\nhttps:\/\/dp\.la\/$/);
    await userEvent.click(screen.getByRole('button', { name: 'Save to Elizabeth Burke' }));
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'TOK', title: 'DPLA', sourceUrl: 'https://dp.la/', profileId: 'profile-1' }),
      expect.any(Function),
    );
    expect(await screen.findByRole('link', { name: 'View the document on Geni' })).toHaveAttribute(
      'href',
      'https://www.geni.com/documents/view?doc_id=5',
    );
  });

  it('uses My profile', async () => {
    signedIn();
    vi.spyOn(geni, 'myProfile').mockResolvedValue(BURKE);
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'My profile' }));
    expect(await screen.findByRole('button', { name: 'Save to Elizabeth Burke' })).toBeInTheDocument();
  });

  it('says so when Geni stays busy', async () => {
    signedIn();
    vi.spyOn(geni, 'searchProfiles').mockRejectedValue(new geni.GeniBusyError());
    renderScreen();
    await userEvent.type(screen.getByLabelText('Find a profile'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('too busy');
  });

  it('shows the busy notice while retrying', async () => {
    signedIn();
    let resolve: (rows: geni.GeniProfile[]) => void = () => {};
    vi.spyOn(geni, 'searchProfiles').mockImplementation((_t, _q, onBusy) => {
      onBusy?.();
      return new Promise((r) => (resolve = r));
    });
    renderScreen();
    await userEvent.type(screen.getByLabelText('Find a profile'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Geni is busy, retrying…');
    resolve([]);
  });

  it('signs out', async () => {
    signedIn();
    renderScreen();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign in to Geni' })).toBeInTheDocument();
    expect(sessionStorage.getItem('rs_geni_token')).toBeNull();
  });
});
