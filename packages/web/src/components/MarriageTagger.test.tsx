import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Spouse } from '@recordseek/core';
import { SessionProvider, useSession, type SessionState } from '../session/SessionContext';
import { MarriageTagger, type SpouseSource } from './MarriageTagger';

function Probe() {
  const { state } = useSession();
  return (
    <div data-testid="probe">
      marriage={String(state.tags.marriage)} couple={state.attach?.coupleId ?? 'none'}
    </div>
  );
}

function renderTagger(spouses: Spouse[], initial?: Partial<SessionState>) {
  const client: SpouseSource = { getPersonSpouses: async () => spouses };
  const base: Partial<SessionState> = {
    attach: { pid: 'P1', name: 'John Smith', url: 'http://fs/P1', justification: '' },
  };
  render(
    <SessionProvider initial={{ ...base, ...initial }}>
      <MarriageTagger pid="P1" client={client} />
      <Probe />
    </SessionProvider>,
  );
}

const probe = () => screen.getByTestId('probe').textContent;

describe('MarriageTagger', () => {
  afterEach(() => sessionStorage.clear());

  it('auto-selects the only spouse when checked', async () => {
    renderTagger([{ coupleId: 'CR-1', spouseId: 'P2', spouseName: 'Jane Smith' }]);
    fireEvent.click(screen.getByLabelText('Marriage'));
    await screen.findByText(/marriage=true/);
    expect(probe()).toContain('couple=CR-1');
  });

  it('shows a notice and stays unchecked when there is no spouse', async () => {
    renderTagger([]);
    fireEvent.click(screen.getByLabelText('Marriage'));
    expect(await screen.findByText(/No spouse on FamilySearch/)).toBeInTheDocument();
    expect(probe()).toContain('marriage=false');
    expect(probe()).toContain('couple=none');
  });

  it('requires a pick when there are several spouses', async () => {
    renderTagger([
      { coupleId: 'CR-1', spouseId: 'P2', spouseName: 'Jane Smith' },
      { coupleId: 'CR-2', spouseId: 'P3', spouseName: 'Mary Jones' },
    ]);
    fireEvent.click(screen.getByLabelText('Marriage'));
    await screen.findByText(/which spouse/i);
    expect(probe()).toContain('couple=none'); // nothing chosen yet
    fireEvent.click(screen.getByLabelText('Mary Jones'));
    expect(probe()).toContain('couple=CR-2');
  });
});
