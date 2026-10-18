import { describe, it, expect, vi } from 'vitest';
import {
  buildZoteroNote,
  newItemKey,
  clearZoteroLogin,
  createItem,
  getZoteroLogin,
  listCollections,
  newWriteToken,
  zoteroItemUrl,
  zoteroStartUrl,
  ZoteroError,
} from './zotero';

const login = { key: 'KEY', userId: '42', username: 'jane' };

function json(body: unknown, status = 200): typeof fetch {
  return vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }) as unknown as typeof fetch;
}

describe('zotero', () => {
  it('builds an escaped child note and an 8-char key', () => {
    expect(buildZoteroNote('KEY12345', 'A <b> & c', 'line1\nline2')).toEqual({
      itemType: 'note',
      parentItem: 'KEY12345',
      note: '<p>A &lt;b&gt; &amp; c</p><p>line1<br/>line2</p>',
    });
    expect(newItemKey()).toMatch(/^[2-9A-NP-Z]{8}$/);
  });

  it('reads and clears the stored login', () => {
    expect(getZoteroLogin()).toBeNull();
    localStorage.setItem('rs_zotero', JSON.stringify(login));
    expect(getZoteroLogin()).toEqual(login);
    clearZoteroLogin();
    expect(getZoteroLogin()).toBeNull();
    localStorage.setItem('rs_zotero', 'not json');
    expect(getZoteroLogin()).toBeNull();
  });

  it('points the start URL at the helper with the return page', () => {
    const url = new URL(zoteroStartUrl('https://recordseek.com/share/'));
    expect(url.searchParams.get('action')).toBe('start');
    expect(url.searchParams.get('return')).toBe('https://recordseek.com/share/');
  });

  it('lists collections sorted by name, sending the API key header', async () => {
    const f = json([
      { key: 'B', data: { name: 'Zebra' } },
      { key: 'A', data: { name: 'Apple' } },
    ]);
    expect(await listCollections(login, f)).toEqual([
      { key: 'A', name: 'Apple' },
      { key: 'B', name: 'Zebra' },
    ]);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.zotero.org/users/42/collections?limit=100');
    expect((init.headers as Record<string, string>)['Zotero-API-Key']).toBe('KEY');
  });

  it('creates an item with a write token', async () => {
    const f = json({ successful: { '0': { key: 'ITEM1', version: 7 } } });
    const made = await createItem(login, [{ itemType: 'webpage', title: 'DPLA' }], 'tok', f);
    expect(made).toEqual({ key: 'ITEM1', version: 7 });
    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Zotero-Write-Token']).toBe('tok');
    expect(JSON.parse(init.body as string)).toHaveLength(1);
  });

  it('reports rejected items and HTTP errors', async () => {
    await expect(createItem(login, [{ itemType: 'webpage', title: 'DPLA' }], 't', json({ failed: { '0': { message: 'bad' } } }))).rejects.toThrow('bad');
    await expect(createItem(login, [{ itemType: 'webpage', title: 'DPLA' }], 't', json({}, 403))).rejects.toBeInstanceOf(ZoteroError);
  });

  it('makes distinct 32-char write tokens and item links', () => {
    expect(newWriteToken()).toMatch(/^[0-9a-f]{32}$/);
    expect(newWriteToken()).not.toBe(newWriteToken());
    expect(zoteroItemUrl('jane', 'ABC')).toBe('https://www.zotero.org/jane/items/ABC');
  });
});
