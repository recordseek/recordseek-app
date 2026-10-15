import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Loading } from '../screens/Loading';
import { completeFsLogin } from '../fsAuth';
import { reportError } from '../sentry';
import { track } from '../analytics';
import { FsApiError } from '@recordseek/core';

/**
 * Handles the FamilySearch OAuth return. The redirect lands at the app root
 * with `?code=…`; we exchange it for a token, strip the code from the URL, and
 * resume the saved route. With no code present, renders children normally.
 */
export function OAuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const hasCode = new URLSearchParams(window.location.search).has('code');
  const [resolving, setResolving] = useState(hasCode);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !hasCode) {
      return;
    }
    ran.current = true;
    completeFsLogin()
      .then((route) => {
        track('fs_login_succeeded');
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        navigate(route ?? '/fs-source', { replace: true });
      })
      .catch((err: unknown) => {
        reportError(err, { step: 'oauth-token-exchange' });
        track('fs_login_failed', {
          reason: err instanceof FsApiError ? `token_exchange_${err.status}` : 'token_exchange_error',
        });
        navigate('/', { replace: true });
      })
      .finally(() => setResolving(false));
  }, [hasCode, navigate]);

  if (resolving) {
    return <Loading status="Signing in to FamilySearch…" />;
  }
  return <>{children}</>;
}
