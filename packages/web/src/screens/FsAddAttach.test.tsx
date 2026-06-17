import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CaptureProvider } from '../capture/CaptureContext';
import { SessionProvider, useSession, type SessionState } from '../session/SessionContext';
import { FsAddAttach } from './FsAddAttach';

function CreateProbe() {
  const { state } = useSession();
  return (
    <div>
      CREATE attach={state.attach?.name ?? 'none'} just={state.attach?.justification ?? ''} np=
      {state.newPerson?.givenName ?? 'none'}
    </div>
  );
}

function renderAddAttach(initial: Partial<SessionState>) {
  return render(
    <CaptureProvider href="http://localhost:9000/?url=https%3A%2F%2Fx.com&title=A%20Record">
      <SessionProvider initial={initial}>
        <MemoryRouter initialEntries={['/fs-addattach']}>
          <Routes>
            <Route path="/fs-addattach" element={<FsAddAttach />} />
            <Route path="/fs-create" element={<CreateProbe />} />
            <Route path="/fs-addperson" element={<div>ADDPERSON</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </CaptureProvider>,
  );
}

const NP = {
  givenName: 'Jane',
  surname: 'Doe',
  gender: 'Female',
  living: false,
  birthDate: '1800',
  birthPlace: '',
  deathDate: '',
  deathPlace: '',
};

describe('FsAddAttach', () => {
  it('shows the person, collects a reason, and hands off to create', async () => {
    renderAddAttach({ newPerson: NP });
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox'), 'new ancestor');
    await userEvent.click(screen.getByRole('button', { name: /Create & Attach/ }));
    expect(await screen.findByText(/CREATE attach=Jane Doe just=new ancestor np=Jane/)).toBeInTheDocument();
  });

  it('redirects to add-person when there is no new person', async () => {
    renderAddAttach({});
    expect(await screen.findByText('ADDPERSON')).toBeInTheDocument();
  });
});
