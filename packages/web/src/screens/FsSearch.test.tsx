import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  function renderWith(initial?: Partial<import('../session/SessionContext').SessionState>) {
    window.sessionStorage.clear();
    return render(
      <SessionProvider initial={initial}>
        <CaptureProvider href={href}>
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

  it('does not overwrite an already-edited search', () => {
    renderWith({ search: { ...emptySearch(), surname: 'Jones' } });
    expect(screen.getByLabelText('Last Names (Surname)')).toHaveValue('Jones');
    expect(screen.getByLabelText('Given Name(s)')).toHaveValue('');
  });
});
