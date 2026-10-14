import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading } from '../screens/Loading';
import { completeFsLogin } from '../fsAuth';
import { reportError } from '../sentry';

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
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        navigate(route ?? '/fs-source', { replace: true });
      })
      .catch((err: unknown) => {
        reportError(err, { step: 'oauth-token-exchange' });
        navigate('/', { replace: true });
      })
      .finally(() => setResolving(false));
  }, [hasCode, navigate]);

  if (resolving) {
    return <Loading status="Signing in to FamilySearch…" />;
  }
  return <>{children}</>;
}
