import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import { useCapture } from '../capture/CaptureContext';
import { captureCitation } from '../citationText';
import {
  addDocument,
  clearGeniToken,
  geniLoginUrl,
  getGeniToken,
  GeniBusyError,
  myProfile,
  searchProfiles,
  type GeniDocument,
  type GeniProfile,
} from '../geni';
import { usePersistedCitationStyle, clearLastService } from '../prefs';
import { reportError } from '../sentry';
import { BackButton } from '../components/BackButton';

const BUSY_TEXT = 'Geni is busy, retrying…';

/**
 * Save the capture to Geni as a document tagged to a profile. Sign-in is the
 * OAuth implicit flow (see geni-callback.html); reads go straight to Geni and
 * writes through the zotero-auth function (no CORS for us, POST only).
 * Login only works on recordseek.com: Geni checks the redirect against the app's site domain.
 */
export function Geni() {
  const capture = useCapture();
  const navigate = useNavigate();
  const [style] = usePersistedCitationStyle();
  const [token, setToken] = useState<string | null>(getGeniToken);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeniProfile[] | null>(null);
  const [picked, setPicked] = useState<GeniProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<GeniDocument | null>(null);

  useEffect(() => {
    track('geni_viewed');
  }, []);

  const text = `${captureCitation(capture, style)}\n\n${capture.url}`;

  /** Runs a Geni call with the busy notice and shared error handling. */
  async function run(step: string, work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (err) {
      track('geni_failed', { step, busy: err instanceof GeniBusyError });
      reportError(err, { screen: 'geni', step });
      setError(
        err instanceof GeniBusyError
          ? 'Geni is too busy right now. Please wait a minute and try again.'
          : 'Geni couldn’t complete that. If it keeps happening, sign in again.',
      );
    } finally {
      setBusy(false);
      setNotice('');
    }
  }

  function signIn(): void {
    track('geni_login_started');
    window.location.assign(geniLoginUrl());
  }

  function signOut(): void {
    clearGeniToken();
    setToken(null);
    setResults(null);
    setPicked(null);
  }

  function search(event: FormEvent): void {
    event.preventDefault();
    if (!token || !query.trim() || busy) return;
    void run('search', async () => {
      setResults(await searchProfiles(token, query.trim(), () => setNotice(BUSY_TEXT)));
      setPicked(null);
    });
  }

  function useMine(): void {
    if (!token || busy) return;
    void run('profile', async () => {
      const me = await myProfile(token, () => setNotice(BUSY_TEXT));
      setResults([me]);
      setPicked(me);
    });
  }

  function save(): void {
    if (!token || !picked || busy) return;
    void run('save', async () => {
      const doc = await addDocument(
        { token, title: capture.title || capture.url, text, sourceUrl: capture.url, profileId: picked.id },
        () => setNotice(BUSY_TEXT),
      );
      track('geni_saved', { tagged: doc.tagged });
      setSaved(doc);
    });
  }

  function back(): void {
    clearLastService();
    navigate('/');
  }

  if (!token) {
    return (
      <main>
        <h3>Save to Geni</h3>
        <p>Sign in to Geni so RecordSeek can add this page as a document on a profile.</p>
        <button type="button" className="primary" onClick={signIn}>
          Sign in to Geni
        </button>
        <div className="form-footer">
          <BackButton onClick={back} />
        </div>
      </main>
    );
  }

  if (saved) {
    return (
      <main>
        <h3>Saved to Geni.</h3>
        {capture.title && <p>“{capture.title}”</p>}
        {!saved.tagged && <p>The document was added, but Geni wouldn’t tag the profile in it. You can tag it on Geni.</p>}
        <p>
          <a href={saved.url} target="_blank" rel="noreferrer">
            View the document on Geni
          </a>
        </p>
        <p>You may now close this window.</p>
      </main>
    );
  }

  return (
    <main>
      <h3>Save to Geni</h3>
      <p>
        For <strong>{capture.title || capture.url}</strong>{' '}
        <button type="button" className="link-button" onClick={signOut}>
          Sign out
        </button>
      </p>

      <form onSubmit={search}>
        <label className="field-label" htmlFor="geni-query">
          Find a profile
        </label>
        <input id="geni-query" type="text" placeholder="Name" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" disabled={busy || !query.trim()}>
          Search
        </button>{' '}
        <button type="button" className="link-button" disabled={busy} onClick={useMine}>
          My profile
        </button>
      </form>

      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {results && results.length === 0 && <p>No profiles found.</p>}
      {results && results.length > 0 && (
        <ul className="plain-list" aria-label="Profiles">
          {results.map((p) => (
            <li key={p.id}>
              <label>
                <input type="radio" name="geni-profile" checked={picked?.id === p.id} onChange={() => setPicked(p)} /> {p.name}
                {p.years ? ` (${p.years})` : ''}
              </label>
            </li>
          ))}
        </ul>
      )}

      {picked && (
        <>
          <label className="field-label" htmlFor="geni-doc">
            Document text
          </label>
          <textarea id="geni-doc" aria-label="Document text" readOnly value={text} rows={5} />
          <p className="field-hint">Geni sets who can see new documents; check the document’s privacy on Geni.</p>
          <button type="button" className="primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : `Save to ${picked.name}`}
          </button>
        </>
      )}

      <div className="form-footer">
        <BackButton onClick={back} />
      </div>
    </main>
  );
}
