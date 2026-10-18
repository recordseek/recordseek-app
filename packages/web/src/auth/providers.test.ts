import { describe, it, expect, vi, beforeEach } from 'vitest';

const revoke = vi.hoisted(() => ({
  geni: vi.fn(),
  zotero: vi.fn(),
  wikitree: vi.fn(),
}));
vi.mock('../geni', async (orig) => ({
  ...(await orig<typeof import('../geni')>()),
  revokeGeniToken: revoke.geni,
}));
vi.mock('../zotero', async (orig) => ({
  ...(await orig<typeof import('../zotero')>()),
  revokeZoteroKey: revoke.zotero,
}));
vi.mock('../wikitree', async (orig) => ({
  ...(await orig<typeof import('../wikitree')>()),
  revokeWikiTreeSession: revoke.wikitree,
}));

import { AUTH_PROVIDERS } from './providers';

const byId = (id: string) => AUTH_PROVIDERS.find((p) => p.id === id)!;

describe('remote revoke on logout', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.values(revoke).forEach((f) => f.mockReset().mockResolvedValue(undefined));
    sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'GT', expiresAt: Date.now() + 60000 }));
    localStorage.setItem('rs_zotero', JSON.stringify({ key: 'ZK', userId: '1', username: 'z' }));
    sessionStorage.setItem('rs_wikitree_session', JSON.stringify({ session: 'WS', userName: 'W-1', userId: 1 }));
  });

  it('revokes each token on the server, then clears local state', async () => {
    await byId('geni').logout();
    await byId('zotero').logout();
    await byId('wikitree').logout();
    expect(revoke.geni).toHaveBeenCalledWith('GT');
    expect(revoke.zotero).toHaveBeenCalledWith(expect.objectContaining({ key: 'ZK' }));
    expect(revoke.wikitree).toHaveBeenCalledWith('WS');
    expect(sessionStorage.getItem('rs_geni_token')).toBeNull();
    expect(localStorage.getItem('rs_zotero')).toBeNull();
    expect(sessionStorage.getItem('rs_wikitree_session')).toBeNull();
  });

  it('still clears local state when the revoke fails', async () => {
    Object.values(revoke).forEach((f) => f.mockRejectedValue(new Error('offline')));
    await byId('geni').logout();
    await byId('zotero').logout();
    await byId('wikitree').logout();
    expect(sessionStorage.getItem('rs_geni_token')).toBeNull();
    expect(localStorage.getItem('rs_zotero')).toBeNull();
    expect(sessionStorage.getItem('rs_wikitree_session')).toBeNull();
  });

  it('gives up on a hung revoke after 5 s and still clears', async () => {
    vi.useFakeTimers();
    revoke.zotero.mockReturnValue(new Promise(() => {}));
    const done = byId('zotero').logout();
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    vi.useRealTimers();
    expect(localStorage.getItem('rs_zotero')).toBeNull();
  });
});
