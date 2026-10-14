import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CITATION_STYLES } from '@recordseek/core';
import { CaptureProvider } from '../capture/CaptureContext';
import { SessionProvider, useSession } from '../session/SessionContext';
import { Source } from './Source';

const HREF =
  'http://localhost:9000/?url=https%3A%2F%2Fwww.ancestry.com%2Fdiscoveryui-content%2Fview%2F123' +
  '&title=John%20Smith%20in%20the%201880%20Census%20-%20Ancestry.com';

function DraftProbe() {
  const { state } = useSession();
  return (
    <div>
      DRAFT title={state.draft?.title ?? ''} url={state.draft?.url ?? ''} hasCitation=
      {String(Boolean(state.draft?.citation))}
    </div>
  );
}

function CreateProbe() {
  const { state } = useSession();
  return <div>CREATE complete={state.complete === 'noAttachment' ? 'noAttachment' : 'other'}</div>;
}

function renderSource() {
  // fs-source requires a signed-in FamilySearch user.
  sessionStorage.setItem('fs_access_token', 'test-token');
  return render(
    <CaptureProvider href={HREF}>
      <SessionProvider>
        <MemoryRouter initialEntries={['/fs-source']}>
          <Routes>
            <Route path="/fs-source" element={<Source />} />
            <Route path="/fs-search" element={<DraftProbe />} />
            <Route path="/fs-create" element={<CreateProbe />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </CaptureProvider>,
  );
}

describe('Source', () => {
  it('remembers the "Save to Source Box" choice', async () => {
    localStorage.clear();
    const { unmount } = renderSource();
    const box = screen.getByLabelText('Save to Source Box') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    expect(box.checked).toBe(false);
    unmount();
    renderSource();
    expect((screen.getByLabelText('Save to Source Box') as HTMLInputElement).checked).toBe(false);
    localStorage.clear();
  });

  it('offers every citation style', () => {
    renderSource();
    expect(screen.getAllByRole('option')).toHaveLength(CITATION_STYLES.length);
  });

  it('rewrites the citation when the format changes', async () => {
    renderSource();
    const citation = screen.getByLabelText('Citation') as HTMLTextAreaElement;
    const before = citation.value;
    await userEvent.selectOptions(screen.getByLabelText('Citation format'), 'mla');
    expect(citation.value).not.toBe(before);
    expect(citation.value).toContain('"John Smith in the 1880 Census."');
  });

  it('carries the title and URL into the draft and advances to search on Next', async () => {
    renderSource();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    const probe = await screen.findByText(/DRAFT title=John Smith in the 1880 Census/);
    expect(probe).toHaveTextContent('url=https://www.ancestry.com/discoveryui-content/view/123');
    expect(probe).toHaveTextContent('hasCitation=true');
  });

  it('saves to the source box without attaching via "Save Now, Attach Later"', async () => {
    renderSource();
    await userEvent.click(screen.getByRole('button', { name: 'Save Now, Attach Later' }));
    expect(await screen.findByText(/CREATE complete=noAttachment/)).toBeInTheDocument();
  });

  it('tags an event to attach and surfaces the count on the button', async () => {
    renderSource();
    // The tag checkboxes live behind the "Tag this Source to Events" toggle.
    expect(screen.queryByLabelText('Birth')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Tag this Source to Events/ }));
    await userEvent.click(screen.getByLabelText('Birth'));
    expect(screen.getByRole('button', { name: /Tag this Source to Events/ })).toHaveTextContent('1');
  });
});
