import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthCheck } from './AuthCheck';

describe('AuthCheck', () => {
  beforeEach(() => {
    // Isolate from any local .env so the test, not the developer's machine,
    // controls the configuration.
    vi.stubEnv('VITE_FS_APP_KEY', '');
    vi.stubEnv('VITE_FS_ENV', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prompts for the app key when none is configured (no password ever requested)', () => {
    render(<AuthCheck />);
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_FS_APP_KEY');
    // there is no password field anywhere — auth happens on FamilySearch's page
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('defaults to the beta (sandbox) environment for safe testing', () => {
    render(<AuthCheck />);
    expect(screen.getByText('beta', { selector: 'strong' })).toBeInTheDocument();
  });
});
