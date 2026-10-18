import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CITATION_STYLES, CITATION_STYLE_LABELS, type CitationStyle } from '@recordseek/core';
import { track } from '../analytics';
import { useCapture } from '../capture/CaptureContext';
import { captureCitation } from '../citationText';
import { usePersistedCitationStyle, clearLastService } from '../prefs';
import { reportError } from '../sentry';
import {
  clearWikiTreeSession,
  confirmAuthcode,
  fetchWatchlist,
  filterPeople,
  getWikiTreeSession,
  hasAuthcode,
  isValidWikiTreeId,
  searchWikiTree,
  takeAuthcode,
  wikiTreeEditUrl,
  wikiTreeLoginUrl,
  wikiTreeRef,
  WikiTreeAuthError,
  type WikiTreePerson,
  type WikiTreeSession,
} from '../wikitree';
import { useAutoSignIn } from '../auth/useAutoSignIn';
import { Loading } from './Loading';
import { BackButton } from '../components/BackButton';
import { SavedActions } from '../components/SavedActions';

/**
 * WikiTree has no write API: format the citation as a `<ref>` block to paste,
 * and open the chosen profile's edit page. The user signs in to WikiTree
 * (clientLogin, see wikitree-callback.html) and picks a person from their
 * watchlist (profiles they manage or follow), or searches all of WikiTree.
 * A typed WikiTree ID (like Smith-123) stays as a fallback.
 */
export function WikiTree() {
  const capture = useCapture();
  const navigate = useNavigate();
  const [style, setStyle] = usePersistedCitationStyle();
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState(false);
  const [wikiId, setWikiId] = useState('');
  const [idError, setIdError] = useState(false);
  const [session, setSession] = useState<WikiTreeSession | null>(getWikiTreeSession);
  const [watchlist, setWatchlist] = useState<WikiTreePerson[] | null>(null);
  const [filter, setFilter] = useState('');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [found, setFound] = useState<WikiTreePerson[] | null>(null);
  const [picked, setPicked] = useState<WikiTreePerson | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(hasAuthcode);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState('');

  useEffect(() => {
    track('wikitree_viewed');
  }, []);

  function lostSession(err: unknown, step: string): void {
    reportError(err, { screen: 'wikitree', step });
    auth.hold();
    track('wikitree_failed', { step });
    if (err instanceof WikiTreeAuthError) {
      clearWikiTreeSession();
      setSession(null);
      setWatchlist(null);
      setError('Your WikiTree sign-in has ended. Please sign in again.');
    } else {
      setError('WikiTree couldn’t complete that. Try again, or enter a WikiTree ID below.');
    }
  }

  // Back from WikiTree with an authcode: confirm it, which also gives us the user's name.
  useEffect(() => {
    const code = takeAuthcode();
    if (!code) return;
    confirmAuthcode(code)
      .then((s) => {
        track('wikitree_login_confirmed');
        setSession(s);
      })
      .catch((err) => lostSession(err, 'login'))
      .finally(() => setConfirming(false));
  }, []);

  // Signed in: prefill the picker with the whole watchlist.
  const sessionCookie = session?.session;
  useEffect(() => {
    if (!sessionCookie) return;
    let cancelled = false;
    setBusy(true);
    fetchWatchlist(sessionCookie)
      .then((people) => !cancelled && setWatchlist(people))
      .catch((err) => !cancelled && lostSession(err, 'watchlist'))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [sessionCookie]);

  const visible = useMemo(() => filterPeople(watchlist ?? [], filter), [watchlist, filter]);

  function signIn(): void {
    track('wikitree_login_started');
    window.location.assign(wikiTreeLoginUrl());
  }

  const auth = useAutoSignIn('wikitree', Boolean(session), signIn, confirming);

  function pick(p: WikiTreePerson): void {
    setPicked(p);
    track('wikitree_picked');
  }

  function search(event: FormEvent): void {
    event.preventDefault();
    if (busy || (!first.trim() && !last.trim())) return;
    setSearching(true);
    setError('');
    searchWikiTree(sessionCookie ?? null, first, last)
      .then(setFound)
      .catch((err) => lostSession(err, 'search'))
      .finally(() => setSearching(false));
  }

  const ref = wikiTreeRef(captureCitation(capture, style), capture.url, capture.title);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(ref);
      track('wikitree_copied');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: select it for a manual copy.
      const box = document.getElementById('wt-ref') as HTMLTextAreaElement | null;
      box?.focus();
      box?.select();
      setCopyHint(true);
      track('wikitree_copy_failed');
    }
  }

  function openPicked(): void {
    if (!picked) return;
    track('wikitree_opened');
    window.open(wikiTreeEditUrl(picked.name), '_blank', 'noopener');
    setOpened(picked.name);
  }

  function openEditor(): void {
    if (!isValidWikiTreeId(wikiId)) {
      setIdError(true);
      track('wikitree_invalid_id');
      return;
    }
    setIdError(false);
    track('wikitree_opened');
    window.open(wikiTreeEditUrl(wikiId), '_blank', 'noopener');
    setOpened(wikiId.trim());
  }

  if (confirming || (!session && auth.redirecting)) return <Loading status="Signing in to WikiTree…" />;
  if (searching) return <Loading status="Searching WikiTree…" />;
  if (session && busy && !watchlist) return <Loading status="Loading your WikiTree watchlist…" />;

  if (opened) {
    return (
      <SavedActions
        heading={`The WikiTree edit page for ${opened} is open.`}
        title={capture.title}
        links={[{ href: wikiTreeEditUrl(opened), label: 'View in WikiTree' }]}
        onEdit={() => setOpened('')}
      >
        <p>Paste the reference into the Sources section there, then save the profile.</p>
      </SavedActions>
    );
  }

  return (
    <main>
      <h3>Add to WikiTree</h3>
      <p>WikiTree can’t take a source automatically. Pick a person, copy the reference below, then paste it into the Sources section of their profile.</p>

      <div className="citation-label-row">
        <label className="field-label" htmlFor="wt-ref">
          Reference
        </label>
        <span className="format-inline">
          <span className="field-hint">Format</span>
          <select aria-label="Citation format" value={style} onChange={(e) => setStyle(e.target.value as CitationStyle)}>
            {CITATION_STYLES.map((s) => (
              <option key={s} value={s}>
                {CITATION_STYLE_LABELS[s]}
              </option>
            ))}
          </select>
        </span>
      </div>
      <textarea id="wt-ref" aria-label="Reference" readOnly value={ref} rows={4} />
      <button type="button" className="primary" onClick={() => void copy()}>
        {copied ? 'Copied!' : 'Copy reference'}
      </button>
      {copyHint && <p role="status">Couldn’t copy automatically. The reference is selected; press Ctrl+C (⌘C on a Mac).</p>}

      <hr />

      {!session ? (
        <>
          <p role="alert">{error || 'WikiTree sign-in didn’t finish. Please try again.'}</p>
          <button type="button" className="primary" onClick={auth.retry}>
            Try again
          </button>
        </>
      ) : (
        <>
          <p>
            Signed in as <strong>{session.userName}</strong>
          </p>
          <label className="field-label" htmlFor="wt-filter">
            Your profiles{watchlist ? ` (${watchlist.length})` : ''}
          </label>
          <input
            id="wt-filter"
            type="search"
            placeholder="Filter by name or WikiTree ID"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {watchlist && visible.length === 0 && <p>{watchlist.length ? 'No one on your watchlist matches.' : 'Your watchlist is empty.'}</p>}
          {visible.length > 0 && (
            <PersonList label="Your profiles" people={visible} picked={picked} onPick={pick} />
          )}

          <form onSubmit={search}>
            <span className="field-label">Search all of WikiTree</span>
            <input type="text" aria-label="First name" placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} />
            <input type="text" aria-label="Last name" placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} />
            <button type="submit" disabled={busy || (!first.trim() && !last.trim())}>
              Search
            </button>
          </form>
          {found && found.length === 0 && <p>No profiles found.</p>}
          {found && found.length > 0 && <PersonList label="Search results" people={found} picked={picked} onPick={pick} />}
        </>
      )}
      {session && error && <p role="alert">{error}</p>}

      {picked && (
        <>
          <p>
            <strong>{picked.display}</strong> ({picked.name}) is chosen. Copy the reference above, then open their edit page and paste it into the Sources section.
          </p>
          <button type="button" className="primary" onClick={openPicked}>
            Open {picked.name} to paste
          </button>
        </>
      )}

      <hr />

      <p className="field-hint">Not on your watchlist? Enter an ID.</p>
      <label className="field-label" htmlFor="wt-id">
        WikiTree ID
      </label>
      <input
        id="wt-id"
        type="text"
        placeholder="Smith-123"
        value={wikiId}
        onChange={(e) => {
          setWikiId(e.target.value);
          setIdError(false);
        }}
        onKeyDown={(e) => e.key === 'Enter' && openEditor()}
      />
      {idError && (
        <p role="alert">A WikiTree ID looks like Smith-123: the surname, a hyphen, then a number.</p>
      )}
      <button type="button" onClick={openEditor}>
        Open the edit page
      </button>

      <div className="form-footer">
        <BackButton
          onClick={() => {
            clearLastService();
            navigate('/');
          }}
        />
      </div>
    </main>
  );
}

function PersonList(props: { label: string; people: WikiTreePerson[]; picked: WikiTreePerson | null; onPick: (p: WikiTreePerson) => void }) {
  return (
    <ul className="plain-list wt-list" aria-label={props.label}>
      {props.people.map((p) => (
        <li key={p.id}>
          <label>
            <input type="radio" name="wt-person" checked={props.picked?.id === p.id} onChange={() => props.onPick(p)} /> {p.display}
            {p.years ? ` (${p.years})` : ''} <span className="field-hint">{p.name}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
