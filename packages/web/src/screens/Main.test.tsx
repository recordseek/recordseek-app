import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { CaptureProvider } from '../capture/CaptureContext';
import { Main } from './Main';
import { saveLastService } from '../prefs';

const HREF = 'http://localhost:9000/?url=https%3A%2F%2Fdp.la%2F&title=Digital%20Public%20Library%20of%20America';

function renderMain() {
  return render(
    <CaptureProvider href={HREF}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/fs-source" element={<div>SOURCE SCREEN</div>} />
          <Route path="/a-source" element={<div>ANCESTRY SCREEN</div>} />
          <Route path="/citation" element={<div>CITATION SCREEN</div>} />
          <Route path="/zotero" element={<div>ZOTERO SCREEN</div>} />
          <Route path="/geni" element={<div>GENI SCREEN</div>} />
          <Route path="/wikitree" element={<div>WIKITREE SCREEN</div>} />
        </Routes>
      </MemoryRouter>
    </CaptureProvider>,
  );
}

describe('Main', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('shows the captured source', () => {
    renderMain();
    expect(screen.getByText('Digital Public Library of America')).toBeInTheDocument();
  });

  it('offers all three services', () => {
    renderMain();
    expect(screen.getByRole('button', { name: 'FamilySearch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ancestry' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to Somewhere Else' })).toBeInTheDocument();
  });

  it('navigates to the chosen service', async () => {
    renderMain();
    await userEvent.click(screen.getByRole('button', { name: 'Save to Somewhere Else' }));
    expect(screen.getByText('CITATION SCREEN')).toBeInTheDocument();
  });

  it('shows the picker even when a service was used before', () => {
    saveLastService('FamilySearch');
    renderMain();
    expect(screen.getByRole('button', { name: 'FamilySearch' })).toBeInTheDocument();
    expect(screen.queryByText('SOURCE SCREEN')).not.toBeInTheDocument();
  });

  it('hides Zotero, Geni and WikiTree by default', () => {
    renderMain();
    for (const name of ['Zotero', 'Geni', 'WikiTree']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
  });

  it('shows them with ?dev=1 and navigates to each', async () => {
    window.history.replaceState(null, '', '/?dev=1');
    renderMain();
    await userEvent.click(screen.getByRole('button', { name: 'Zotero' }));
    expect(screen.getByText('ZOTERO SCREEN')).toBeInTheDocument();
    expect(localStorage.getItem('recordseek-last-service')).toBe('Zotero');
  });

  it('routes Geni and WikiTree tiles', async () => {
    window.history.replaceState(null, '', '/?dev=1');
    const { unmount } = renderMain();
    await userEvent.click(screen.getByRole('button', { name: 'Geni' }));
    expect(screen.getByText('GENI SCREEN')).toBeInTheDocument();
    unmount();
    renderMain();
    await userEvent.click(screen.getByRole('button', { name: 'WikiTree' }));
    expect(screen.getByText('WIKITREE SCREEN')).toBeInTheDocument();
  });
});
