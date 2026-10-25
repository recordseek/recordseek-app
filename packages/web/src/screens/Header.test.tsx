import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { Header } from './Header';
import { saveLastService, getLastService } from '../prefs';

function LocationDisplay() {
  const loc = useLocation();
  return <div>PATH:{loc.pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

afterEach(() => sessionStorage.clear());

describe('Header breadcrumb', () => {
  it('shows the FamilySearch logo throughout the FS flow', () => {
    renderAt('/fs-search');
    expect(screen.getByRole('img', { name: 'FamilySearch' })).toBeInTheDocument();
  });

  it('shows the Ancestry logo on the Ancestry screen', () => {
    renderAt('/a-source');
    expect(screen.getByRole('img', { name: 'Ancestry' })).toBeInTheDocument();
  });

  it('shows the citation crumb text', () => {
    renderAt('/citation');
    expect(screen.getByText('Save Citation')).toBeInTheDocument();
  });

  it('shows no service crumb on the main picker', () => {
    renderAt('/');
    expect(screen.queryByRole('img', { name: 'FamilySearch' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Ancestry' })).toBeNull();
    expect(screen.queryByText('Save Citation')).toBeNull();
  });

  it('clicking the brand returns to the picker and clears the remembered service', async () => {
    saveLastService('FamilySearch');
    renderAt('/fs-search');
    await userEvent.click(screen.getByRole('button', { name: 'RecordSeek home' }));
    expect(screen.getByText('PATH:/')).toBeInTheDocument();
    expect(getLastService()).toBeNull();
  });
});

describe('Header menu', () => {
  it('opens the idea/bug form from Help', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('dialog', { name: 'Send us an idea or bug' })).toBeInTheDocument();
  });

  it('lists About, Donate, Help in that order, each with an icon', () => {
    renderAt('/');
    const nav = screen.getByRole('navigation', { name: 'RecordSeek' });
    expect([...nav.children].map((el) => el.textContent)).toEqual(['About', 'Donate', 'Help']);
    expect(nav.querySelectorAll('svg.menu-icon')).toHaveLength(3);
  });

  it('links About to the website in a new tab', () => {
    renderAt('/');
    const about = screen.getByRole('link', { name: 'About' });
    expect(about).toHaveAttribute('href', 'https://recordseek.com/');
    expect(about).toHaveAttribute('target', '_blank');
  });

  it('goes to the donation page from Donate', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Donate' }));
    expect(screen.getByText('PATH:/donate')).toBeInTheDocument();
  });

  it('hides Donate inside the native app (App Store guideline 3.1.1)', () => {
    sessionStorage.setItem('rs_app', '1'); // marks the native-app wrapper context
    renderAt('/');
    expect(screen.queryByRole('button', { name: 'Donate' })).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'RecordSeek' });
    expect([...nav.children].map((el) => el.textContent)).toEqual(['About', 'Help']);
  });
});
