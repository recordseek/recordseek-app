import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FsApiError, FsNetworkError } from '@recordseek/core';
import { OAuthGate } from './OAuthGate';

const navigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => navigate }));

const completeFsLogin = vi.fn();
const beginFsLogin = vi.fn();
vi.mock('../fsAuth', () => ({
  completeFsLogin: () => completeFsLogin(),
  beginFsLogin: () => beginFsLogin(),
  pendingReturnRoute: () => '/fs-source',
}));
vi.mock('../fsErrors', () => ({ describeFsError: () => 'Something went wrong. Please try again.' }));
const reportError = vi.fn();
vi.mock('../sentry', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
const track = vi.fn();
vi.mock('../analytics', () => ({ track: (...a: unknown[]) => track(...a) }));

function setUrl(search: string) {
  window.history.replaceState({}, '', '/' + search);
}

beforeEach(() => setUrl(''));
afterEach(() => {
  vi.clearAllMocks();
  setUrl('');
});

describe('OAuthGate', () => {
  it('renders children when there is no OAuth code', () => {
    render(<OAuthGate><div>app content</div></OAuthGate>);
    expect(screen.getByText('app content')).toBeInTheDocument();
    expect(completeFsLogin).not.toHaveBeenCalled();
  });

  it('exchanges the code, strips it from the URL and resumes the saved route', async () => {
    setUrl('?code=abc123');
    completeFsLogin.mockResolvedValue('/geni');
    render(<OAuthGate><div>app content</div></OAuthGate>);

    expect(screen.getByText(/Signing in to FamilySearch/)).toBeInTheDocument();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/geni', { replace: true }));
    expect(track).toHaveBeenCalledWith('fs_login_succeeded');
    expect(window.location.search).toBe(''); // code removed so a reload can't replay it
  });

  it('shows a 4xx-specific message and reports a non-network failure', async () => {
    setUrl('?code=bad');
    completeFsLogin.mockRejectedValue(new FsApiError(400, '', 'bad request'));
    render(<OAuthGate><div>app content</div></OAuthGate>);

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t accept the sign-in/);
    expect(track).toHaveBeenCalledWith('fs_login_failed', { reason: 'token_exchange_400' });
    expect(reportError).toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('does not report a dropped-network failure to Sentry', async () => {
    setUrl('?code=neterr');
    completeFsLogin.mockRejectedValue(new FsNetworkError('offline', true));
    render(<OAuthGate><div>app content</div></OAuthGate>);

    expect(await screen.findByRole('heading', { name: /Sign-in didn’t finish/ })).toBeInTheDocument();
    expect(track).toHaveBeenCalledWith('fs_login_failed', { reason: 'token_exchange_network' });
    expect(reportError).not.toHaveBeenCalled();
  });
});
