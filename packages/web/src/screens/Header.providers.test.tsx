import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';

const fsOn = vi.hoisted(() => ({ value: false }));
vi.mock('../fsAuth', () => ({
  isFsAuthenticated: () => fsOn.value,
  fetchFsUser: () => Promise.resolve({ displayName: 'Fiona' }),
  logoutFs: async () => {
    fsOn.value = false;
  },
}));
vi.mock('../zotero', async (orig) => ({ ...(await orig<typeof import('../zotero')>()), revokeZoteroKey: async () => {} }));
vi.mock('../wikitree', async (orig) => ({ ...(await orig<typeof import('../wikitree')>()), revokeWikiTreeSession: async () => {} }));
const myProfile = vi.hoisted(() => vi.fn());
vi.mock('../geni', async (orig) => ({
  ...(await orig<typeof import('../geni')>()),
  myProfile,
  revokeGeniToken: async () => {},
}));

import { Header } from './Header';

function Where() {
  return <div>PATH:{useLocation().pathname}</div>;
}
function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
      <Where />
    </MemoryRouter>,
  );
}

describe('Header for Geni, Zotero and WikiTree', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    myProfile.mockReset();
    fsOn.value = false;
  });

  it('Geni: fetches the name once, caches it, and logout clears the token', async () => {
    sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'T', expiresAt: Date.now() + 60000 }));
    myProfile.mockResolvedValue({ name: 'Gena Geni' });
    renderAt('/geni');
    expect(await screen.findByText('Hello Gena Geni!')).toBeInTheDocument();
    expect(sessionStorage.getItem('rs_geni_me')).toBe('Gena Geni');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(sessionStorage.getItem('rs_geni_token')).toBeNull();
    expect(await screen.findByText('PATH:/')).toBeInTheDocument();
  });

  it('Geni: reuses the cached name without calling Geni', async () => {
    sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'T', expiresAt: Date.now() + 60000 }));
    sessionStorage.setItem('rs_geni_me', 'Cached Name');
    renderAt('/geni-search');
    expect(await screen.findByText('Hello Cached Name!')).toBeInTheDocument();
    expect(myProfile).not.toHaveBeenCalled();
  });

  it('Zotero: shows the username; logout clears the login', async () => {
    localStorage.setItem('rs_zotero', JSON.stringify({ key: 'k', userId: '1', username: 'zed' }));
    renderAt('/zotero');
    expect(await screen.findByText('Hello zed!')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(localStorage.getItem('rs_zotero')).toBeNull();
    expect(await screen.findByText('PATH:/')).toBeInTheDocument();
  });

  it('WikiTree: shows the user name; logout clears the session', async () => {
    sessionStorage.setItem('rs_wikitree_session', JSON.stringify({ session: 's', userName: 'Smith-1', userId: 1 }));
    renderAt('/wikitree');
    expect(await screen.findByText('Hello Smith-1!')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(sessionStorage.getItem('rs_wikitree_session')).toBeNull();
    expect(await screen.findByText('PATH:/')).toBeInTheDocument();
  });

  it('shows nothing when signed out', () => {
    renderAt('/zotero');
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  describe('multiple accounts', () => {
    function signInAll() {
      fsOn.value = true;
      sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'T', expiresAt: Date.now() + 60000 }));
      sessionStorage.setItem('rs_geni_me', 'Gena');
      sessionStorage.setItem('rs_auth_attempted_geni', '1');
      localStorage.setItem('rs_zotero', JSON.stringify({ key: 'k', userId: '1', username: 'zed' }));
      sessionStorage.setItem('rs_wikitree_session', JSON.stringify({ session: 's', userName: 'Smith-1', userId: 1 }));
      sessionStorage.setItem('rs_capture', 'keep me');
    }

    it('shows Log out on the home route and opens a modal listing every account', async () => {
      signInAll();
      renderAt('/');
      await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByAltText('FamilySearch')).toBeInTheDocument();
      expect(within(dialog).getByAltText('Geni')).toBeInTheDocument();
      expect(await within(dialog).findByText('Fiona')).toBeInTheDocument();
      expect(within(dialog).getByText('zed')).toBeInTheDocument();
    });

    it('lists the current service first and keeps the greeting in its flow', async () => {
      signInAll();
      renderAt('/zotero');
      expect(await screen.findByText('Hello zed!')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
      const rows = within(screen.getByRole('dialog')).getAllByRole('listitem');
      expect(within(rows[0]!).getByAltText('Zotero')).toBeInTheDocument();
    });

    it('logs out of one row and stays open; the last one closes and goes home', async () => {
      signInAll();
      localStorage.removeItem('rs_zotero');
      sessionStorage.removeItem('rs_wikitree_session');
      renderAt('/zotero');
      await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
      await userEvent.click(screen.getByRole('button', { name: 'Log out of Geni' }));
      expect(sessionStorage.getItem('rs_geni_token')).toBeNull();
      expect(sessionStorage.getItem('rs_geni_me')).toBeNull();
      expect(sessionStorage.getItem('rs_auth_attempted_geni')).toBeNull();
      expect(fsOn.value).toBe(true);
    });

    it('Log out of all clears every store but not the captured source', async () => {
      signInAll();
      renderAt('/');
      await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
      await userEvent.click(screen.getByRole('button', { name: 'Log out of all' }));
      expect(fsOn.value).toBe(false);
      expect(sessionStorage.getItem('rs_geni_token')).toBeNull();
      expect(localStorage.getItem('rs_zotero')).toBeNull();
      expect(sessionStorage.getItem('rs_wikitree_session')).toBeNull();
      expect(sessionStorage.getItem('rs_capture')).toBe('keep me');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    });
  });

  it('shows no button on the home route when signed out', () => {
    renderAt('/');
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('a single account logs out directly from the home route', async () => {
    localStorage.setItem('rs_zotero', JSON.stringify({ key: 'k', userId: '1', username: 'zed' }));
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem('rs_zotero')).toBeNull();
  });
});
