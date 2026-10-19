import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { Ancestry2 } from './Ancestry2';
import { Ancestry2Search } from './Ancestry2Search';
import { Ancestry2Attach } from './Ancestry2Attach';
import { Ancestry2Complete } from './Ancestry2Complete';
import { loadAncestry2Flow, storeAncestry2Flow } from '../ancestry2/flow';
import { companionRequest } from '../ancestry2/browser-transport.mjs';

vi.mock('../ancestry2/browser-transport.mjs', () => ({
  companionRequest: vi.fn(),
}));

const request = vi.mocked(companionRequest);
const HREF =
  'http://localhost:9000/?url=https%3A%2F%2Fdp.la%2Fitem%2F1&title=Digital%20Public%20Library&notes=Captured%20note';
const ACCOUNT = { userId: 'user-1', trees: [{ id: '3319960', name: 'Paukstys Family Tree' }], recentTreeId: '3319960' };
const SIGNED_IN = { version: 2, signedIn: true, ...ACCOUNT };
const PRANAS = {
  personId: '-1749097799',
  name: 'Pranas Paukstys',
  gender: 'male' as const,
  living: false,
  birth: '16 Aug 1919, Vilkaviskis, Lithuania',
  death: '17 Mar 1971',
};
const SOURCE = {
  title: 'Digital Public Library',
  url: 'https://dp.la/item/1',
  citation: 'The citation',
  notes: 'Captured note',
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CaptureProvider href={HREF}>
        <Routes>
          <Route path="/" element={<p>Picker</p>} />
          <Route path="/ancestry2" element={<Ancestry2 />} />
          <Route path="/ancestry2-search" element={<Ancestry2Search />} />
          <Route path="/ancestry2-attach" element={<Ancestry2Attach />} />
          <Route path="/ancestry2-complete" element={<Ancestry2Complete />} />
        </Routes>
      </CaptureProvider>
    </MemoryRouter>,
  );
}

describe('Ancestry2', () => {
  beforeEach(() => {
    request.mockReset();
    sessionStorage.clear();
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-1111-1111-111111111111' });
  });

  it('shows the FamilySearch source fields once signed in, then goes on to search', async () => {
    request.mockResolvedValue(SIGNED_IN);
    renderAt('/ancestry2');
    expect(await screen.findByRole('heading', { name: 'Attach a Source' })).toBeInTheDocument();
    expect(screen.getByLabelText('Source Title')).toHaveValue('Digital Public Library');
    expect(screen.getByLabelText(/Source \(URL\)/)).toHaveValue('https://dp.la/item/1');
    expect(screen.getByLabelText(/Notes/)).toHaveValue('Captured note');
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByRole('heading', { name: 'Search for an existing person' })).toBeInTheDocument();
    expect(loadAncestry2Flow().account?.userId).toBe('user-1');
    expect(loadAncestry2Flow().treeId).toBe('3319960');
  });

  it('asks to install the companion when it does not answer', async () => {
    request.mockRejectedValue(new Error('not responding'));
    renderAt('/ancestry2');
    expect(await screen.findByRole('dialog', { name: 'Install the Ancestry2 companion' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download the companion' })).toHaveAttribute(
      'href',
      expect.stringContaining('ancestry2-companion.zip'),
    );
  });

  it('asks to update an old companion that reports no version', async () => {
    request.mockResolvedValue({ connected: false });
    renderAt('/ancestry2');
    expect(await screen.findByRole('dialog', { name: 'Update the Ancestry2 companion' })).toBeInTheDocument();
  });

  it('opens Ancestry sign-in when signed out and continues once signed in', async () => {
    let signedIn = false;
    request.mockImplementation(async (op) => {
      if (op === 'signin') {
        signedIn = true;
        return { opened: true };
      }
      return signedIn ? SIGNED_IN : { version: 2, signedIn: false };
    });
    renderAt('/ancestry2');
    expect(await screen.findByRole('dialog', { name: 'Sign in to Ancestry' })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('signin');
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Attach a Source' })).toBeInTheDocument();
  });

  it('searches the chosen tree and selects a person', async () => {
    storeAncestry2Flow({ ...loadAncestry2Flow(), account: ACCOUNT, source: SOURCE, treeId: '3319960' });
    request.mockResolvedValue({ people: [PRANAS] });
    renderAt('/ancestry2-search');
    await userEvent.type(screen.getByLabelText('Given Name(s)'), 'Pranas');
    await userEvent.type(screen.getByLabelText('Last Names (Surname)'), 'Paukstys');
    await userEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(request).toHaveBeenCalledWith('search', { treeId: '3319960', name: 'Pranas Paukstys' });
    expect(await screen.findByText(/16 Aug 1919/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(await screen.findByRole('heading', { name: /Attach Source to Pranas Paukstys/ })).toBeInTheDocument();
  });

  it('saves to the selected person and shows the saved screen', async () => {
    storeAncestry2Flow({
      ...loadAncestry2Flow(),
      account: ACCOUNT,
      source: SOURCE,
      treeId: '3319960',
      selected: PRANAS,
    });
    request.mockResolvedValue({
      state: 'complete',
      result: { ok: true, verified: true, sourceId: '1', citationId: '2', personUrl: 'https://www.ancestry.com/p' },
    });
    renderAt('/ancestry2-attach');
    await userEvent.click(screen.getByRole('button', { name: /Save Source/ }));
    expect(request).toHaveBeenCalledWith(
      'save',
      {
        userId: 'user-1',
        target: { treeId: '3319960', personId: '-1749097799' },
        source: { title: 'Digital Public Library', note: 'Captured note' },
        citation: { detail: 'The citation', url: 'https://dp.la/item/1' },
      },
      { requestId: '11111111-1111-1111-1111-111111111111' },
    );
    expect(await screen.findByText('Saved to Ancestry on Pranas Paukstys.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Pranas Paukstys on Ancestry' })).toHaveAttribute(
      'href',
      'https://www.ancestry.com/p',
    );
  });

  it('blocks another save until the user checks Ancestry after an unknown outcome', async () => {
    storeAncestry2Flow({
      ...loadAncestry2Flow(),
      account: ACCOUNT,
      source: SOURCE,
      treeId: '3319960',
      selected: PRANAS,
    });
    request.mockRejectedValue(new Error('timeout'));
    renderAt('/ancestry2-attach');
    await userEvent.click(screen.getByRole('button', { name: /Save Source/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Check the person on Ancestry/);
    expect(screen.getByRole('button', { name: /Save Source/ })).toBeDisabled();
    expect(request).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /I checked Ancestry/ }));
    expect(screen.getByRole('button', { name: /Save Source/ })).toBeEnabled();
  });

  it('allows saving again when nothing reached Ancestry', async () => {
    storeAncestry2Flow({
      ...loadAncestry2Flow(),
      account: ACCOUNT,
      source: SOURCE,
      treeId: '3319960',
      selected: PRANAS,
    });
    request.mockResolvedValue({
      state: 'complete',
      result: { ok: false, mayHaveWritten: false, message: 'Enter a source title.' },
    });
    renderAt('/ancestry2-attach');
    await userEvent.click(screen.getByRole('button', { name: /Save Source/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a source title.');
    expect(screen.getByRole('button', { name: /Save Source/ })).toBeEnabled();
  });

  it('sends the screens back to the start without a source', async () => {
    request.mockResolvedValue(SIGNED_IN);
    renderAt('/ancestry2-attach');
    expect(await screen.findByRole('heading', { name: 'Attach a Source' })).toBeInTheDocument();
  });
});
