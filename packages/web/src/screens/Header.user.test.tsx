import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';

const { logoutFs } = vi.hoisted(() => ({ logoutFs: vi.fn(() => Promise.resolve()) }));
vi.mock('../fsAuth', () => ({
  isFsAuthenticated: () => true,
  fetchFsUser: () => Promise.resolve({ displayName: 'Dōvy', givenName: 'Dōvy' }),
  logoutFs,
}));

// Header is imported after the mock so it binds to the mocked fsAuth.
import { Header } from './Header';

function LocationDisplay() {
  const loc = useLocation();
  return <div>PATH:{loc.pathname}</div>;
}

describe('Header user / logout', () => {
  beforeEach(() => {
    logoutFs.mockClear();
  });

  it('greets the signed-in FamilySearch user on FS routes', async () => {
    render(
      <MemoryRouter initialEntries={['/fs-source']}>
        <Header />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Hello Dōvy!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('shows no greeting or logout outside the FamilySearch flow', () => {
    render(
      <MemoryRouter initialEntries={['/a-source']}>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Hello Dōvy!')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('logs out and returns to the picker', async () => {
    render(
      <MemoryRouter initialEntries={['/fs-source']}>
        <Header />
        <LocationDisplay />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logoutFs).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('PATH:/')).toBeInTheDocument();
  });
});
