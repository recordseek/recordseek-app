import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import { useCapture } from '../capture/CaptureContext';
import { clearLastService } from '../prefs';
import { reportError } from '../sentry';
import {
  buildZoteroNote,
  newItemKey,
  clearZoteroLogin,
  createItem,
  getZoteroLogin,
  listCollections,
  newWriteToken,
  zoteroItemUrl,
  zoteroStartUrl,
  ZoteroError,
  type ZoteroCollection,
  type ZoteroLogin,
} from '../zotero';
import { BackButton } from '../components/BackButton';
import { SourceFields, useSourceFields } from '../components/SourceFields';
import { TagEventsPicker, TAG_LABELS } from '../components/TagEventsButton';
import { EVENT_TAGS, type EventTag } from '../session/SessionContext';
import { SavedActions } from '../components/SavedActions';
import { accessedIso, buildZoteroItem, validateZoteroForm } from '../zoteroForm';

type Status = 'idle' | 'saving' | 'error';

/** The share app's own page (no capture query), where the Zotero sign-in returns to. */
function returnUrl(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

/**
 * Save the capture to a Zotero library as a library item. Sign-in is OAuth 1.0a
 * through the zotero-auth function (which holds the client secret); the API key
 * it returns lives in localStorage and calls go straight to api.zotero.org.
 */
export function Zotero() {
  const capture = useCapture();
  const navigate = useNavigate();
  const { values, style, onChange, setStyle } = useSourceFields(capture);
  const accessed = useMemo(() => accessedIso(capture.accessedDate), [capture.accessedDate]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [login, setLogin] = useState<ZoteroLogin | null>(getZoteroLogin);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [collection, setCollection] = useState('');
  const [eventTags, setEventTags] = useState<Record<EventTag, boolean>>(() => Object.fromEntries(EVENT_TAGS.map((t) => [t, false])) as Record<EventTag, boolean>);
  const tags = EVENT_TAGS.filter((t) => eventTags[t]).map((t) => TAG_LABELS[t]);
  const [status, setStatus] = useState<Status>('idle');
  const [errorText, setErrorText] = useState('');
  const [savedKey, setSavedKey] = useState('');
  // One token per save attempt: a retry after a dropped response can't duplicate the item.
  const writeToken = useRef(newWriteToken());

  useEffect(() => {
    track('zotero_viewed');
    try {
      if (sessionStorage.getItem('rs_zotero_new') && getZoteroLogin()) {
        sessionStorage.removeItem('rs_zotero_new');
        track('zotero_connected');
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const current = { title: values.title, url: values.url, publisher: capture.publisher, accessed, collectionKey: collection || undefined, tags };

  useEffect(() => {
    if (!login) return;
    let live = true;
    listCollections(login)
      .then((rows) => live && setCollections(rows))
      .catch((err: unknown) => {
        if (!live) return;
        if (err instanceof ZoteroError && (err.status === 403 || err.status === 401)) {
          // The key was revoked on zotero.org: start over.
          clearZoteroLogin();
          setLogin(null);
          track('zotero_failed', { step: 'collections', status: err.status });
          return;
        }
        // Collections are optional: saving to the library root still works.
        track('zotero_failed', { step: 'collections' });
      });
    return () => {
      live = false;
    };
  }, [login]);

  function connect(): void {
    track('zotero_login_started');
    window.location.assign(zoteroStartUrl(returnUrl()));
  }

  function disconnect(): void {
    clearZoteroLogin();
    setLogin(null);
    setCollections([]);
    track('zotero_disconnected');
  }

  async function save(): Promise<void> {
    if (!login || status === 'saving') return;
    const problems = validateZoteroForm(current);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setStatus('saving');
    try {
      const key = newItemKey();
      const item = buildZoteroItem(current, key);
      const items = [item];
      // The citation and the user's notes travel as a child note (Extra stays the user's).
      if (values.citation.trim() || values.notes.trim()) items.push(buildZoteroNote(key, values.citation, values.notes));
      // Parent and child note go in one request, so the note can name the client-made key.
      const made = await createItem(login, items, writeToken.current);
      track('zotero_saved', { has_collection: Boolean(collection) });
      setSavedKey(made.key);
      setStatus('idle');
    } catch (err) {
      if (err instanceof ZoteroError && (err.status === 403 || err.status === 401)) {
        clearZoteroLogin();
        setLogin(null);
        setStatus('idle');
        track('zotero_failed', { step: 'save', status: err.status });
        return;
      }
      track('zotero_failed', { step: 'save', status: err instanceof ZoteroError ? err.status : 0 });
      reportError(err, { screen: 'zotero', step: 'save' });
      setErrorText('Zotero couldn’t save this page. Please try again.');
      setStatus('error');
    }
  }

  function back(): void {
    clearLastService();
    navigate('/');
  }

  if (!login) {
    return (
      <main>
        <h3>Save to Zotero</h3>
        <p>Connect your Zotero account so RecordSeek can add this page to your library.</p>
        <button type="button" className="primary" onClick={connect}>
          Connect Zotero
        </button>
        <div className="form-footer">
          <BackButton onClick={back} />
        </div>
      </main>
    );
  }

  if (savedKey) {
    return (
      <SavedActions
        heading="Saved to Zotero."
        title={values.title}
        links={[{ href: zoteroItemUrl(login.username || login.userId, savedKey), label: 'View in Zotero' }]}
        onEdit={() => {
          writeToken.current = newWriteToken(); // saving again is a new item
          setSavedKey('');
        }}
      />
    );
  }

  return (
    <main>
      <div className="attach-header">
        <h2 className="attach-title">Save to Zotero</h2>
        <TagEventsPicker
          selected={eventTags}
          onToggle={(t) => setEventTags((prev) => ({ ...prev, [t]: !prev[t] }))}
          count={tags.length}
        />
      </div>
      <p>
        Library: <strong>{login.username || `user ${login.userId}`}</strong>{' '}
        <button type="button" className="link-button" onClick={disconnect}>
          Disconnect
        </button>
      </p>

      <SourceFields values={values} style={style} onChange={onChange} onStyleChange={setStyle} idPrefix="zotero" />
      {errors.title && <p role="alert">{errors.title}</p>}
      {errors.url && <p role="alert">{errors.url}</p>}

      <div className="field">
      <label className="field-label" htmlFor="zotero-collection">
        Collection
      </label>
      <select id="zotero-collection" value={collection} onChange={(e) => setCollection(e.target.value)}>
        <option value="">My Library</option>
        {collections.map((c) => (
          <option key={c.key} value={c.key}>
            {c.name}
          </option>
        ))}
      </select>
      </div>
      <p className="field-hint">Accessed {capture.accessedDate}</p>

      {status === 'error' && <p role="alert">{errorText}</p>}
      <button type="button" className="primary" disabled={status === 'saving'} onClick={() => void save()}>
        {status === 'saving' ? 'Saving…' : 'Save to Zotero'}
      </button>

      <div className="form-footer">
        <BackButton onClick={back} />
      </div>
    </main>
  );
}
