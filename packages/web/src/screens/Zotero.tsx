import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import { useCapture } from '../capture/CaptureContext';
import { clearLastService } from '../prefs';
import { reportError } from '../sentry';
import {
  buildZoteroItem,
  buildZoteroNote,
  newItemKey,
  ZOTERO_ITEM_TYPES,
  type ZoteroItemType,
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
  const [itemType, setItemType] = useState<ZoteroItemType>('webpage');
  const [login, setLogin] = useState<ZoteroLogin | null>(getZoteroLogin);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [collection, setCollection] = useState('');
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
    setStatus('saving');
    try {
      const key = newItemKey();
      const item = buildZoteroItem(
        { ...values, itemType, publisher: capture.publisher, collectionKey: collection || undefined },
        new Date(),
        key,
      );
      // Parent and child note go in one request, so the note can name the client-made key.
      const made = await createItem(login, [item, buildZoteroNote(key, values.citation, values.notes)], writeToken.current);
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
      <main>
        <h3>Saved to Zotero.</h3>
        {capture.title && <p>“{capture.title}”</p>}
        <p>
          <a href={zoteroItemUrl(login.username || login.userId, savedKey)} target="_blank" rel="noreferrer">
            View it on zotero.org
          </a>
        </p>
        <p>You may now close this window.</p>
      </main>
    );
  }

  return (
    <main>
      <h3>Save to Zotero</h3>
      <p>
        Library: <strong>{login.username || `user ${login.userId}`}</strong>{' '}
        <button type="button" className="link-button" onClick={disconnect}>
          Disconnect
        </button>
      </p>

      <SourceFields idPrefix="zotero" values={values} style={style} onChange={onChange} onStyleChange={setStyle} />

      <div className="field">
        <label className="field-label" htmlFor="zotero-item-type">
          Item type
        </label>
        <select id="zotero-item-type" value={itemType} onChange={(e) => setItemType(e.target.value as ZoteroItemType)}>
          {ZOTERO_ITEM_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <label className="field-label" htmlFor="zotero-collection">
        Collection
      </label>
      <select id="zotero-collection" value={collection} onChange={(e) => setCollection(e.target.value)}>
        <option value="">My Library (no collection)</option>
        {collections.map((c) => (
          <option key={c.key} value={c.key}>
            {c.name}
          </option>
        ))}
      </select>

      {status === 'error' && <p role="alert">{errorText}</p>}
      <button type="button" className="primary" disabled={status === 'saving' || !values.title.trim() || !values.url.trim()} onClick={() => void save()}>
        {status === 'saving' ? 'Saving…' : 'Save to Zotero'}
      </button>

      <div className="form-footer">
        <BackButton onClick={back} />
      </div>
    </main>
  );
}
