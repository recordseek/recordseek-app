import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { SessionProvider, useSession, type SessionState } from '../session/SessionContext';
import { FsComplete } from './FsComplete';

function SearchProbe() {
  const { state } = useSession();
  return (
    <div>
      SEARCH attach={state.attach?.name ?? 'none'} srcId={state.createdSourceId ?? 'none'}
    </div>
  );
}

function renderComplete(initial: Partial<SessionState>) {
  return render(
    <SessionProvider initial={initial}>
      <MemoryRouter initialEntries={['/fs-complete']}>
        <Routes>
          <Route path="/fs-complete" element={<FsComplete />} />
          <Route path="/fs-search" element={<SearchProbe />} />
          <Route path="/fs-source" element={<div>SOURCE</div>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

describe('FsComplete', () => {
  it('shows the source-box success and can attach to a person', async () => {
    renderComplete({ complete: 'noAttachment', draft: { url: '', title: 'A Record', citation: '', notes: '' } });
    expect(screen.getByRole('heading', { name: /added to your FamilySearch source box/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Attach to a Person' }));
    expect(await screen.findByText(/SEARCH attach=none/)).toBeInTheDocument();
  });

  it('offers both the created source and the source box on save-only', () => {
    renderComplete({
      complete: 'noAttachment',
      draft: { url: '', title: 'A Record', citation: '', notes: '' },
      createdSourceId: 'WNH2-4YT',
    });
    expect(screen.getByRole('link', { name: 'View this source on FamilySearch' })).toHaveAttribute(
      'href',
      'https://www.familysearch.org/en/tree/sources/viewedit/WNH2-4YT',
    );
    expect(screen.getByRole('link', { name: 'View your source box on FamilySearch' })).toHaveAttribute(
      'href',
      'https://www.familysearch.org/en/tree/sources/sourceBox/',
    );
  });

  it('shows the attached-to-person success and reuses the source on re-attach', async () => {
    renderComplete({
      complete: { pid: 'P1', name: 'John Smith', url: 'http://fs/P1', justification: '' },
      draft: { url: '', title: 'A Record', citation: '', notes: '' },
      createdSourceId: 'SD-1',
    });
    expect(screen.getByRole('heading', { name: /attached to John Smith/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Profile on FamilySearch' })).toHaveAttribute('href', 'http://fs/P1');
    await userEvent.click(screen.getByRole('button', { name: 'Attach to Another Person' }));
    expect(await screen.findByText('SEARCH attach=none srcId=SD-1')).toBeInTheDocument();
  });

  it('shows an error state when nothing completed', async () => {
    renderComplete({});
    expect(screen.getByRole('heading', { name: /there seems to have been an error/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(await screen.findByText('SOURCE')).toBeInTheDocument();
  });
});
