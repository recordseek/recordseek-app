import { useEffect, useRef, useState } from 'react';
import { generateCodeVerifier, deriveCodeChallenge } from '@recordseek/core';
import { createFsClient, getFsConfig } from '../auth/fsClient';

const VERIFIER_KEY = 'fs_pkce_verifier';

type Status =
  | { kind: 'idle' }
  | { kind: 'authenticating' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

/**
 * Read-only FamilySearch live-auth check (D0–D2/D4 of the verification plan).
 *
 * The user authenticates on FamilySearch's own page (PKCE) — we never see their
 * password. On return we exchange the code, then read the current user and
 * their source folders. No data is written. The create/file/attach write proof
 * is deliberately left out of this harness so it can't mutate a real tree.
 */
export function AuthCheck() {
  const { appKey, environment } = getFsConfig();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [user, setUser] = useState<unknown>(null);
  const [collections, setCollections] = useState<unknown>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) return;
    const verifier = sessionStorage.getItem(VERIFIER_KEY) ?? undefined;
    setStatus({ kind: 'authenticating' });
    const client = createFsClient();
    client
      .exchangeToken(code, verifier)
      .then(async () => {
        const currentUser = await client.getCurrentUser();
        setUser(currentUser);
        const userId = (currentUser as { id?: string } | null)?.id;
        if (userId) {
          setCollections(await client.getUserCollections(userId));
        }
        setStatus({ kind: 'ready' });
      })
      .catch((err: unknown) => {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
      });
  }, []);

  async function login(): Promise<void> {
    if (!appKey) return;
    let codeChallenge: string | undefined;
    if (getFsConfig().pkce) {
      const verifier = generateCodeVerifier();
      sessionStorage.setItem(VERIFIER_KEY, verifier);
      codeChallenge = await deriveCodeChallenge(verifier);
    } else {
      sessionStorage.removeItem(VERIFIER_KEY);
    }
    const client = createFsClient();
    window.location.href = client.buildAuthorizationUrl({ codeChallenge, state: 'authcheck' });
  }

  return (
    <main>
      <h1>FamilySearch auth check</h1>
      <p>
        Environment: <strong>{environment}</strong>
      </p>
      {!appKey && (
        <p role="alert">
          Set <code>VITE_FS_APP_KEY</code> (and optionally <code>VITE_FS_ENV</code>) in a local{' '}
          <code>.env</code>, then reload. Use <code>beta</code> for safe testing.
        </p>
      )}
      {status.kind === 'idle' && appKey && (
        <button type="button" onClick={() => void login()}>
          Log in with FamilySearch
        </button>
      )}
      {status.kind === 'authenticating' && <p>Authenticating…</p>}
      {status.kind === 'error' && <p role="alert">Error: {status.message}</p>}
      {status.kind === 'ready' && (
        <section>
          <h2>Current user</h2>
          <pre aria-label="current-user">{JSON.stringify(user, null, 2)}</pre>
          <h2>Source folders</h2>
          <pre aria-label="source-folders">{JSON.stringify(collections, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
