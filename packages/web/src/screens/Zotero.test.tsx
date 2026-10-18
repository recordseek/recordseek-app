import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { Zotero } from './Zotero';
import { stubRedirect } from '../test/redirect';

const HREF = 'http://localhost:9000/?_=1781642252441&url=https%3A%2F%2Fdp.la%2F&title=DPLA';

function renderScreen() {
  return render(
    <CaptureProvider href={HREF}>
      <MemoryRouter initialEntries={['/zotero']}>
        <Routes>
          <Route path="/zotero" element={<Zotero />} />
          <Route path="/" element={<div>MAIN</div>} />
        </Routes>
      </MemoryRouter>
    </CaptureProvider>,
  );
}

function connect(): void {
  localStorage.setItem('rs_zotero', JSON.stringify({ key: 'KEY', userId: '42', username: 'jane' }));
}

/** Routes api.zotero.org calls: collections and the duplicate search on GET, item creation on POST. */
function mockApi(post: { ok: boolean; status: number; body: unknown }, existing: unknown[] = []) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: post.ok, status: post.status, json: async () => post.body };
    if (url.includes('/items/top')) return { ok: true, status: 200, json: async () => existing };
    expect(url).toContain('/collections');
    return { ok: true, status: 200, json: async () => [{ key: 'C1', data: { name: 'Research' } }] };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

function posted(f: ReturnType<typeof mockApi>) {
  const post = f.mock.calls.find(([, init]) => init?.method === 'POST')![1] as RequestInit;
  return { post, items: JSON.parse(post.body as string) as Array<Record<string, any>> };
}

afterEach(() => vi.unstubAllGlobals());

describe('Zotero', () => {
  it('redirects to Zotero at once when there is no key, showing the Loading screen', () => {
    const assign = stubRedirect();
    renderScreen();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Signing in to Zotero…');
  });

  it('does not redirect again after a failed return: shows Try again', async () => {
    const assign = stubRedirect();
    sessionStorage.setItem('rs_auth_attempted_zotero', '1');
    renderScreen();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Zotero sign-in didn’t finish');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('shows Loading while collections load and while saving', async () => {
    connect();
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          await gate;
          return { ok: true, status: 200, json: async () => ({ successful: { '0': { key: 'ITEM1', version: 3 } } }) };
        }
        return { ok: true, status: 200, json: async () => [] };
      }),
    );
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent('Loading your Zotero collections…');
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Zotero' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saving to Zotero…');
    release();
    await screen.findByRole('link', { name: 'View in Zotero' });
  });

  it('shows only the FamilySearch-style fields, with Accessed as plain text', async () => {
    connect();
    mockApi({ ok: true, status: 200, body: {} });
    renderScreen();
    await screen.findByRole('option', { name: 'Research' });
    for (const l of [
      'Source Title',
      'Source (URL)',
      'Citation',
      'Citation format',
      'Describe the Record (Notes)',
      'Collection',
    ]) {
      expect(screen.getByLabelText(l)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/accessed/i)).toBeNull();
    expect(screen.getByText(/^Accessed \d{1,2} \w+ \d{4}$/)).toBeInTheDocument();
    for (const l of [/item type/i, /author/i, /more/i, /language/i]) expect(screen.queryByLabelText(l)).toBeNull();
    expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
    expect(screen.getByRole('option', { name: 'My Library' })).toBeInTheDocument();
  });

  it('saves a webpage to the chosen collection with the note and a parsed accessDate', async () => {
    connect();
    const f = mockApi({ ok: true, status: 200, body: { successful: { '0': { key: 'ITEM1', version: 3 } } } });
    renderScreen();
    await screen.findByRole('option', { name: 'Research' });
    await userEvent.selectOptions(screen.getByLabelText('Collection'), 'C1');
    await userEvent.type(screen.getByLabelText('Describe the Record (Notes)'), 'my notes');
    await userEvent.click(screen.getByRole('button', { name: 'Save to Zotero' }));
    const link = await screen.findByRole('link', { name: 'View in Zotero' });
    expect(link).toHaveAttribute('href', 'https://www.zotero.org/jane/items/ITEM1');
    const { post, items } = posted(f);
    const [item, note] = items as [Record<string, any>, Record<string, any>];
    expect(item).toMatchObject({
      itemType: 'webpage',
      title: 'DPLA',
      url: 'https://dp.la/',
      websiteTitle: 'Dp',
      collections: ['C1'],
      tags: [],
    });
    expect(item.accessDate).toBe('2026-06-16T00:00:00Z');
    expect(item.key).toMatch(/^[2-9A-NP-Z]{8}$/);
    expect(note).toMatchObject({ itemType: 'note', parentItem: item.key });
    expect(note.note).toContain('DPLA');
    expect(note.note).toContain('my notes');
    expect((post.headers as Record<string, string>)['Zotero-Write-Token']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('has the FamilySearch event-tag control, sending checked events as tags', async () => {
    connect();
    const f = mockApi({ ok: true, status: 200, body: { successful: { '0': { key: 'ITEM1', version: 3 } } } });
    renderScreen();
    await screen.findByRole('option', { name: 'Research' });
    await userEvent.click(screen.getByRole('button', { name: /Tag this Source to Events/ }));
    await userEvent.click(screen.getByLabelText('Birth'));
    await userEvent.click(screen.getByLabelText('Death'));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: /Tag this Source to Events/ })).toHaveTextContent('2');
    await userEvent.click(screen.getByRole('button', { name: 'Save to Zotero' }));
    await screen.findByRole('link', { name: 'View in Zotero' });
    expect(posted(f).items[0]!.tags).toEqual([{ tag: 'Birth' }, { tag: 'Death' }]);
  });

  it('sends no tags when no event is checked', async () => {
    connect();
    const f = mockApi({ ok: true, status: 200, body: { successful: { '0': { key: 'ITEM1', version: 3 } } } });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Zotero' }));
    await screen.findByRole('link', { name: 'View in Zotero' });
    expect(posted(f).items[0]!.tags).toEqual([]);
  });

  it('blocks a save with an empty title and names the problem', async () => {
    connect();
    const f = mockApi({ ok: true, status: 200, body: {} });
    renderScreen();
    await screen.findByRole('option', { name: 'Research' });
    await userEvent.clear(screen.getByLabelText('Source Title'));
    await userEvent.click(screen.getByRole('button', { name: 'Save to Zotero' }));
    expect(await screen.findByText('A title is required.')).toBeInTheDocument();
    expect(f.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('offers Go Back to edit and Save to Another Location after saving', async () => {
    connect();
    mockApi({ ok: true, status: 200, body: { successful: { '0': { key: 'ITEM1', version: 3 } } } });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Zotero' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Go Back' }));
    expect(screen.getByLabelText('Source Title')).toHaveValue('DPLA');
    await userEvent.click(screen.getByRole('button', { name: 'Save to Zotero' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Another Location' }));
    expect(screen.getByText('MAIN')).toBeInTheDocument();
  });

  it('shows an error when the save fails and lets the user retry', async () => {
    connect();
    mockApi({ ok: false, status: 500, body: {} });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Zotero' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t save');
    expect(screen.getByRole('button', { name: 'Save to Zotero' })).toBeEnabled();
  });

  it('asks before saving a page already in the library, then saves a copy on request', async () => {
    connect();
    const f = mockApi(
      { ok: true, status: 200, body: { successful: { '0': { key: 'ITEM1', version: 3 } } } },
      [{ key: 'OLD1', data: { url: 'https://dp.la/' } }],
    );
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Zotero' }));
    expect(await screen.findByText('This page is already in your Zotero library.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View it in Zotero' })).toHaveAttribute(
      'href',
      'https://www.zotero.org/jane/items/OLD1',
    );
    expect(f.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Save another copy' }));
    expect(await screen.findByText('Saved to Zotero.')).toBeInTheDocument();
  });

  it('drops a revoked key back to Connect', async () => {
    connect();
    mockApi({ ok: false, status: 403, body: {} });
    const stubbed = stubRedirect();
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Zotero' }));
    expect(stubbed).toHaveBeenCalledTimes(1); // a revoked key signs in again
    expect(localStorage.getItem('rs_zotero')).toBeNull();
  });
});
