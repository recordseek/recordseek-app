import { describe, it, expect } from 'vitest';
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
    expect(screen.getByText('Save to Somewhere Else')).toBeInTheDocument();
  });

  it('shows no service crumb on the main picker', () => {
    renderAt('/');
    expect(screen.queryByRole('img', { name: 'FamilySearch' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Ancestry' })).toBeNull();
    expect(screen.queryByText('Save to Somewhere Else')).toBeNull();
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
  it('opens the idea/bug form from Support', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: 'Support' }));
    expect(screen.getByRole('dialog', { name: 'Send us an idea or bug' })).toBeInTheDocument();
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
});
