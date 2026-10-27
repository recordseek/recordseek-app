import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { SessionProvider, useSession, type SessionState } from '../session/SessionContext';
import { FsAttach } from './FsAttach';

function CreateProbe() {
  const { state, tagCount } = useSession();
  return (
    <div>
      CREATE just={state.attach?.justification ?? ''} tags={tagCount}
    </div>
  );
}

function renderAttach(initial: Partial<SessionState>) {
  return render(
    <CaptureProvider href="http://localhost:9000/?url=https%3A%2F%2Fx.com&title=A%20Record">
      <SessionProvider initial={initial}>
        <MemoryRouter initialEntries={['/fs-attach']}>
          <Routes>
            <Route path="/fs-attach" element={<FsAttach />} />
            <Route path="/fs-create" element={<CreateProbe />} />
            <Route path="/fs-results" element={<div>RESULTS</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </CaptureProvider>,
  );
}

const withAttach = { attach: { pid: 'P1', name: 'John Smith', url: 'http://x', justification: '' } };

describe('FsAttach', () => {
  it('collects tags + justification and carries them to fs-create', async () => {
    renderAttach(withAttach);
    expect(screen.getByRole('link', { name: 'John Smith' })).toBeInTheDocument();

    // Tagging now lives behind the "Tag this Source to Events" popover.
    expect(screen.queryByLabelText('Birth')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Tag this Source to Events/ }));
    await userEvent.click(screen.getByLabelText('Birth'));
    expect(screen.getByRole('button', { name: /Tag this Source to Events/ })).toHaveTextContent('1');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await userEvent.type(screen.getByRole('textbox'), 'census match');
    await userEvent.click(screen.getByRole('button', { name: /Create & Attach/ }));

    expect(await screen.findByText(/CREATE just=census match tags=1/)).toBeInTheDocument();
  });

  it('does not show the Marriage checkbox while the couple write is disabled', async () => {
    // MARRIAGE_WRITE_ENABLED is false (couple source-ref 400s, RECORDSEEK-EX),
    // so the no-op checkbox is hidden — even inside the popover with the vitals.
    renderAttach(withAttach);
    expect(screen.queryByLabelText('Marriage')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Tag this Source to Events/ }));
    expect(screen.getByLabelText('Birth')).toBeInTheDocument();
    expect(screen.queryByLabelText('Marriage')).toBeNull();
  });

  it('redirects away when there is no selected person (no crash)', async () => {
    renderAttach({});
    expect(await screen.findByText('RESULTS')).toBeInTheDocument();
  });
});
