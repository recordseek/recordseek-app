import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { Zotero } from './Zotero';

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

/** Routes api.zotero.org calls: collections on GET, item creation on POST. */
function mockApi(post: { ok: boolean; status: number; body: unknown }) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { ok: post.ok, status: post.status, json: async () => post.body };
    expect(url).toContain('/collections');
    return { ok: true, status: 200, json: async () => [{ key: 'C1', data: { name: 'Research' } }] };
  });
  vi.stubGlobal('fetch', f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe('Zotero', () => {
  it('offers Connect when there is no key', () => {
    renderScreen();
    expect(screen.getByRole('button', { name: 'Connect Zotero' })).toBeInTheDocument();
  });

  it('saves to the chosen collection and links to the item', async () => {
    connect();
    const f = mockApi({ ok: true, status: 200, body: { successful: { '0': { key: 'ITEM1', version: 3 } } } });
    renderScreen();
    await screen.findByRole('option', { name: 'Research' });
    await userEvent.selectOptions(screen.getByLabelText('Collection'), 'C1');
    await userEvent.click(screen.getByRole('button', { name: 'Save to Zotero' }));
    const link = await screen.findByRole('link', { name: 'View it on zotero.org' });
    expect(link).toHaveAttribute('href', 'https://www.zotero.org/jane/items/ITEM1');
    const post = f.mock.calls.find(([, init]) => init?.method === 'POST')![1] as RequestInit;
    const [item, note] = JSON.parse(post.body as string);
    expect(item).toMatchObject({ itemType: 'webpage', url: 'https://dp.la/', collections: ['C1'] });
    expect(item.key).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
    expect(note).toMatchObject({ itemType: 'note', parentItem: item.key });
    expect(note.note).toContain('DPLA');
    expect((post.headers as Record<string, string>)['Zotero-Write-Token']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('saves the edited fields as the chosen item type', async () => {
    connect();
    const f = mockApi({ ok: true, status: 200, body: { successful: { '0': { key: 'ITEM1', version: 3 } } } });
    renderScreen();
    await screen.findByRole('option', { name: 'Research' });
    const title = screen.getByLabelText('Source Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Edited');
    expect((screen.getByLabelText('Citation') as HTMLTextAreaElement).value).toContain('Edited');
    await userEvent.type(screen.getByLabelText(/Describe the Record/), 'my notes');
    await userEvent.selectOptions(screen.getByLabelText('Item type'), 'newspaperArticle');
    await userEvent.click(screen.getByRole('button', { name: 'Save to Zotero' }));
    await screen.findByRole('link', { name: 'View it on zotero.org' });
    const post = f.mock.calls.find(([, init]) => init?.method === 'POST')![1] as RequestInit;
    const [item, note] = JSON.parse(post.body as string);
    expect(item).toMatchObject({ itemType: 'newspaperArticle', title: 'Edited' });
    expect(item.extra).toContain('Edited');
    expect(note.note).toContain('my notes');
  });

  it('shows an error when the save fails and lets the user retry', async () => {
    connect();
    mockApi({ ok: false, status: 500, body: {} });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Zotero' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t save');
    expect(screen.getByRole('button', { name: 'Save to Zotero' })).toBeEnabled();
  });

  it('drops a revoked key back to Connect', async () => {
    connect();
    mockApi({ ok: false, status: 403, body: {} });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Save to Zotero' }));
    expect(await screen.findByRole('button', { name: 'Connect Zotero' })).toBeInTheDocument();
    expect(localStorage.getItem('rs_zotero')).toBeNull();
  });

  it('disconnects', async () => {
    connect();
    mockApi({ ok: true, status: 200, body: {} });
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    expect(screen.getByRole('button', { name: 'Connect Zotero' })).toBeInTheDocument();
    expect(localStorage.getItem('rs_zotero')).toBeNull();
  });
});
