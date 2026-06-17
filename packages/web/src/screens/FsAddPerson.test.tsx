import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider, useSession } from '../session/SessionContext';
import { FsAddPerson } from './FsAddPerson';

function NpProbe() {
  const { state } = useSession();
  return (
    <div>
      NP {state.newPerson?.givenName} {state.newPerson?.surname} living={String(state.newPerson?.living)}
    </div>
  );
}

function renderAddPerson() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/fs-addperson']}>
        <Routes>
          <Route path="/fs-addperson" element={<FsAddPerson />} />
          <Route path="/fs-addattach" element={<NpProbe />} />
          <Route path="/fs-search" element={<div>SEARCH</div>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

describe('FsAddPerson', () => {
  it('captures vitals and advances to the review step', async () => {
    renderAddPerson();
    await userEvent.type(screen.getByLabelText('Given Name(s)'), 'Jane');
    await userEvent.type(screen.getByLabelText('Last Names'), 'Doe');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(/NP Jane Doe/)).toBeInTheDocument();
  });

  it('disables death fields for a living person', async () => {
    renderAddPerson();
    expect(screen.getByLabelText('Date of Death')).toBeEnabled();
    await userEvent.click(screen.getByLabelText('Living'));
    expect(screen.getByLabelText('Date of Death')).toBeDisabled();
  });
});
