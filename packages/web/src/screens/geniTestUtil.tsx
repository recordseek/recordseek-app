import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { GeniFlowProvider, type GeniFlowState } from '../session/GeniContext';
import { emptyCriteria, type GeniProfile } from '../geni';
import { Geni } from './Geni';
import { GeniSearch } from './GeniSearch';
import { GeniResults } from './GeniResults';
import { GeniAttach } from './GeniAttach';
import { GeniComplete } from './GeniComplete';

const HREF = 'http://localhost:9000/?_=1781642252441&url=https%3A%2F%2Fdp.la%2F&title=DPLA';

export const BURKE: GeniProfile = {
  id: 'profile-1',
  name: 'Elizabeth Burke',
  years: '1712 – 1770',
  url: 'https://www.geni.com/people/Elizabeth-Burke/6000000000000000001',
  gender: 'female',
  birthYear: 1712,
  deathYear: 1770,
  birthPlace: 'Norfolk, Virginia',
};

export const SOURCE = { title: 'DPLA', url: 'https://dp.la/', citation: 'DPLA cite', notes: 'my notes' };

export function signIn(): void {
  sessionStorage.setItem('rs_geni_token', JSON.stringify({ token: 'TOK', expiresAt: Date.now() + 60000 }));
}

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

/** Renders the whole Geni flow at `route`, with the wizard state pre-seeded. */
export function renderGeni(route: string, flow: Partial<GeniFlowState> = {}): RenderResult {
  const state: GeniFlowState = { source: SOURCE, search: emptyCriteria(), selected: null, saved: null, ...flow };
  sessionStorage.setItem('rs_geni_flow', JSON.stringify(state));
  return render(
    <CaptureProvider href={HREF}>
      <GeniFlowProvider>
        <MemoryRouter initialEntries={[route]}>
          <Where />
          <Routes>
            <Route path="/" element={<div>MAIN</div>} />
            <Route path="/geni" element={<Geni />} />
            <Route path="/geni-search" element={<GeniSearch />} />
            <Route path="/geni-results" element={<GeniResults />} />
            <Route path="/geni-attach" element={<GeniAttach />} />
            <Route path="/geni-complete" element={<GeniComplete />} />
          </Routes>
        </MemoryRouter>
      </GeniFlowProvider>
    </CaptureProvider>,
  );
}
