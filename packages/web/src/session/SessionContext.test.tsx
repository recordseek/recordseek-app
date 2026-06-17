import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionProvider, useSession, emptySearch, isSearchEmpty } from './SessionContext';

describe('isSearchEmpty', () => {
  it('treats a blank form as empty, ignoring the advanced toggle', () => {
    expect(isSearchEmpty(emptySearch())).toBe(true);
    expect(isSearchEmpty({ ...emptySearch(), advanced: true })).toBe(true);
  });

  it('is non-empty once any criterion is set', () => {
    expect(isSearchEmpty({ ...emptySearch(), surname: 'Smith' })).toBe(false);
    expect(isSearchEmpty({ ...emptySearch(), pid: 'LZ12-345' })).toBe(false);
  });
});

function Harness() {
  const s = useSession();
  return (
    <div>
      <span data-testid="given">{s.state.search.givenName}</span>
      <span data-testid="tagcount">{s.tagCount}</span>
      <span data-testid="attach">{s.state.attach?.name ?? 'none'}</span>
      <span data-testid="justification">{s.state.attach?.justification ?? ''}</span>
      <button onClick={() => s.updateSearch({ givenName: 'John' })}>set-given</button>
      <button onClick={() => s.toggleTag('birth')}>toggle-birth</button>
      <button onClick={() => s.selectPerson({ pid: 'P1', name: 'John Smith', url: 'http://x', justification: '' })}>
        select
      </button>
      <button onClick={() => s.setJustification('because')}>justify</button>
      <button onClick={() => s.resetSearch()}>reset</button>
    </div>
  );
}

describe('SessionProvider', () => {
  it('drives search, tags, and attach state', async () => {
    render(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );
    await userEvent.click(screen.getByText('set-given'));
    expect(screen.getByTestId('given').textContent).toBe('John');

    await userEvent.click(screen.getByText('toggle-birth'));
    expect(screen.getByTestId('tagcount').textContent).toBe('1');

    await userEvent.click(screen.getByText('select'));
    expect(screen.getByTestId('attach').textContent).toBe('John Smith');

    await userEvent.click(screen.getByText('justify'));
    expect(screen.getByTestId('justification').textContent).toBe('because');

    await userEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('given').textContent).toBe('');
  });

  it('persists to sessionStorage and restores on remount (survives a reload)', async () => {
    const first = render(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );
    await userEvent.click(screen.getByText('set-given'));
    expect(screen.getByTestId('given').textContent).toBe('John');
    expect(sessionStorage.getItem('rs_session')).toContain('John');

    // Unmount + remount with no `initial` mimics a page reload; the criteria come back.
    first.unmount();
    render(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );
    expect(screen.getByTestId('given').textContent).toBe('John');
  });

  it('lets an explicit `initial` win over persisted state', () => {
    sessionStorage.setItem('rs_session', JSON.stringify({ search: { ...emptySearch(), givenName: 'Stale' } }));
    render(
      <SessionProvider initial={{ search: { ...emptySearch(), givenName: 'Fresh' } }}>
        <Harness />
      </SessionProvider>,
    );
    expect(screen.getByTestId('given').textContent).toBe('Fresh');
  });
});
