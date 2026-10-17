import { describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { SessionProvider, emptySearch } from '../session/SessionContext';
import { CaptureProvider } from '../capture/CaptureContext';
import { FsSearch, normalizePid } from './FsSearch';

function renderSearch() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/fs-search']}>
        <Routes>
          <Route path="/fs-search" element={<FsSearch />} />
          <Route path="/fs-results" element={<div>RESULTS</div>} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

describe('normalizePid', () => {
  it('uppercases and dashes into groups of four', () => {
    expect(normalizePid('lz12345')).toBe('LZ12-345');
    expect(normalizePid('GKLM9988')).toBe('GKLM-9988');
    expect(normalizePid('')).toBe('');
  });
});

describe('FsSearch', () => {
  it('disables Next until a criterion is entered, then navigates to results', async () => {
    renderSearch();
    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Last Names (Surname)'), 'Smith');
    expect(next).toBeEnabled();
    await userEvent.click(next);
    expect(screen.getByText('RESULTS')).toBeInTheDocument();
  });

  it('shows the relationship fields in the compact grid (no advanced toggle)', () => {
    renderSearch();
    expect(screen.getByLabelText("Spouse's Given Name(s)")).toBeInTheDocument();
    expect(screen.getByLabelText("Father's Surname")).toBeInTheDocument();
  });

  it('disables the search fields once a Person ID is entered', async () => {
    renderSearch();
    await userEvent.type(screen.getByLabelText(/Person ID/), 'lz12345');
    expect(screen.getByLabelText(/Person ID/)).toHaveValue('LZ12-345');
    expect(screen.getByLabelText('Last Names (Surname)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('offers a residence (census) event type', () => {
    renderSearch();
    expect(screen.getByRole('option', { name: 'Residence / Census' })).toBeInTheDocument();
  });

  it('disables event year/place until an event type is chosen', async () => {
    renderSearch();
    expect(screen.getByLabelText('Event Place')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Event Type'), 'birthLike');
    expect(screen.getByLabelText('Event Place')).toBeEnabled();
  });
});

describe('FsSearch genscrape pre-fill', () => {
  const href =
    'https://recordseek.com/share/?url=https%3A%2F%2Fx.com%2Fr&givenName=John&surname=Smith&gender=Male&birthDate=12%20Mar%201850&birthPlace=Ohio&fatherGivenName=Bob';

  function renderWith(initial?: Partial<import('../session/SessionContext').SessionState>, keepSession = false, captureHref = href) {
    if (!keepSession) window.sessionStorage.clear();
    return render(
      <SessionProvider initial={initial}>
        <CaptureProvider href={captureHref}>
          <MemoryRouter initialEntries={['/fs-search']}>
            <Routes>
              <Route path="/fs-search" element={<FsSearch />} />
            </Routes>
          </MemoryRouter>
        </CaptureProvider>
      </SessionProvider>,
    );
  }

  it('pre-fills the search from person params', () => {
    renderWith();
    expect(screen.getByLabelText('Given Name(s)')).toHaveValue('John');
    expect(screen.getByLabelText('Last Names (Surname)')).toHaveValue('Smith');
    expect(screen.getByLabelText('Gender')).toHaveValue('male');
    expect(screen.getByLabelText('Event Type')).toHaveValue('birthLike');
    expect(screen.getByLabelText('Event year from')).toHaveValue('1850');
    expect(screen.getByLabelText('Event Place')).toHaveValue('Ohio');
    expect(screen.getByLabelText("Father's Given Name(s)")).toHaveValue('Bob');
  });

  it('pre-fills a new capture in the same tab, but not the same capture twice', () => {
    renderWith().unmount();
    const applied = window.sessionStorage.getItem('rs_search_prefilled');
    // Same tab, search cleared (e.g. Reset), same capture: stays blank.
    window.sessionStorage.clear();
    window.sessionStorage.setItem('rs_search_prefilled', applied ?? '');
    renderWith(undefined, true);
    expect(screen.getByLabelText('Given Name(s)')).toHaveValue('');
    cleanup();
    // A different capture in the same tab pre-fills again.
    window.sessionStorage.clear();
    window.sessionStorage.setItem('rs_search_prefilled', applied ?? '');
    renderWith(undefined, true, href.replace('givenName=John', 'givenName=Mary'));
    expect(screen.getByLabelText('Given Name(s)')).toHaveValue('Mary');
  });

  it('does not overwrite an already-edited search', () => {
    renderWith({ search: { ...emptySearch(), surname: 'Jones' } });
    expect(screen.getByLabelText('Last Names (Surname)')).toHaveValue('Jones');
    expect(screen.getByLabelText('Given Name(s)')).toHaveValue('');
  });

  it("keeps Next disabled when only a relative's name is entered", async () => {
    renderSearch();
    await userEvent.type(screen.getByLabelText(/Father's Given Name/), 'Bertram');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Add a name, year or place for the person to search.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Last Names (Surname)'), 'Smith');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('keeps Next disabled for an event type with no year or place', async () => {
    renderSearch();
    await userEvent.selectOptions(screen.getByLabelText('Event Type'), 'residence');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Event Place'), 'Pittsburgh');
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});
