import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Loading } from '../screens/Loading';
import { beginFsLogin, completeFsLogin, pendingReturnRoute } from '../fsAuth';
import { describeFsError } from '../fsErrors';
import { reportError } from '../sentry';
import { track } from '../analytics';
import { FsApiError, FsNetworkError } from '@recordseek/core';

/**
 * Handles the FamilySearch OAuth return. The redirect lands at the app root
 * with `?code=…`; we exchange it for a token, strip the code from the URL, and
 * resume the saved route. With no code present, renders children normally.
 */
export function OAuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const hasCode = new URLSearchParams(window.location.search).has('code');
  const [resolving, setResolving] = useState(hasCode);
  const [failed, setFailed] = useState<string | null>(null);
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
        // A connection that dropped twice is the user's network, not a bug.
        if (!(err instanceof FsNetworkError)) {
          reportError(err, { step: 'oauth-code-exchange' });
        }
        track('fs_login_failed', {
          reason:
            err instanceof FsApiError
              ? `token_exchange_${err.status}`
              : err instanceof FsNetworkError
                ? 'token_exchange_network'
                : 'token_exchange_error',
        });
        // The code is single-use; never leave it in the URL (a reload would replay it).
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
        setFailed(err instanceof FsApiError && err.status >= 400 && err.status < 500
          ? 'FamilySearch didn’t accept the sign-in. Please try signing in again.'
          : describeFsError(err));
      })
      .finally(() => setResolving(false));
  }, [hasCode, navigate]);

  if (resolving) {
    return <Loading status="Signing in to FamilySearch…" />;
  }
  if (failed) {
    return (
      <main>
        <h3>Sign-in didn’t finish</h3>
        <p role="alert">{failed}</p>
        <div className="form-footer">
          <button type="button" onClick={() => { setFailed(null); navigate('/', { replace: true }); }}>
            Back to start
          </button>
          <div className="footer-right">
            <button
              type="button"
              className="primary"
              onClick={() => {
                beginFsLogin(pendingReturnRoute()).catch((err: unknown) => {
                  reportError(err, { step: 'oauth-retry' });
                  setFailed('Signing in still isn’t working. Reload the page and try again.');
                });
              }}
            >
              Sign in again
            </button>
          </div>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
