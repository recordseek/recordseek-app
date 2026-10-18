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
import { useSourceFields } from '../components/SourceFields';
import { SavedActions } from '../components/SavedActions';
import { ZoteroItemEditor } from '../components/ZoteroItemEditor';
import {
  applyPrefill,
  buildZoteroItem,
  fallbackSchema,
  loadItemSchema,
  metaFromCapture,
  switchItemType,
  validateZoteroForm,
  type ItemSchema,
  type ZoteroCreator,
  type ZoteroForm,
  type ZoteroItemType,
} from '../zoteroForm';

type Status = 'idle' | 'saving' | 'error';

/** The capture's human "18 October 2026" as YYYY-MM-DD in local time; today if unparseable. */
function accessedIso(human: string): string {
  const ms = Date.parse(human);
  const d = Number.isNaN(ms) ? new Date() : new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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
  const meta = useMemo(() => metaFromCapture(capture), [capture]);
  const [schema, setSchema] = useState<ItemSchema>(() => fallbackSchema('webpage'));
  const [form, setForm] = useState<ZoteroForm>(() =>
    applyPrefill(
      {
        itemType: 'webpage',
        fields: { title: capture.title, url: capture.url, accessDate: accessedIso(capture.accessedDate) },
        creators: [],
        tags: '',
        citation: '',
        notes: '',
      },
      meta,
      fallbackSchema('webpage'),
    ),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
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

  // Swap the embedded schema for the live one once it arrives; only empty fields get prefilled.
  useEffect(() => {
    let live = true;
    const t = form.itemType;
    void loadItemSchema(t).then((s) => {
      if (!live) return;
      setSchema(s);
      setForm((prev) => (prev.itemType === t ? applyPrefill(prev, meta, s) : prev));
    });
    return () => {
      live = false;
    };
  }, [form.itemType, meta]);

  function onType(t: ZoteroItemType): void {
    const s = fallbackSchema(t);
    setSchema(s);
    setForm((prev) => applyPrefill(switchItemType(prev, t, s), meta, s));
  }

  function onField(name: string, value: string): void {
    setForm((prev) => ({ ...prev, fields: { ...prev.fields, [name]: value } }));
    if (name === 'title') onChange({ title: value }); // regenerates the citation note
    if (name === 'url') onChange({ url: value });
  }

  function onPatch(p: Partial<ZoteroForm>): void {
    const { citation, notes, ...rest } = p;
    if (citation !== undefined || notes !== undefined) onChange({ ...(citation !== undefined && { citation }), ...(notes !== undefined && { notes }) });
    if (Object.keys(rest).length) setForm((prev) => ({ ...prev, ...rest }));
  }

  const current: ZoteroForm = { ...form, citation: values.citation, notes: values.notes, collectionKey: collection || undefined };

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
    const problems = validateZoteroForm(current, schema);
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setStatus('saving');
    try {
      const key = newItemKey();
      const item = buildZoteroItem(current, schema, key);
      const items = [item];
      // The citation and the user's notes travel as a child note (Extra stays the user's).
      if (current.citation.trim() || current.notes.trim()) items.push(buildZoteroNote(key, current.citation, current.notes));
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
        title={current.fields.title}
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
      <h3>Save to Zotero</h3>
      <p>
        Library: <strong>{login.username || `user ${login.userId}`}</strong>{' '}
        <button type="button" className="link-button" onClick={disconnect}>
          Disconnect
        </button>
      </p>

      <ZoteroItemEditor
        form={current}
        schema={schema}
        errors={errors}
        style={style}
        onField={onField}
        onType={onType}
        onCreators={(creators: ZoteroCreator[]) => setForm((prev) => ({ ...prev, creators }))}
        onPatch={onPatch}
        onStyle={setStyle}
      />

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
      <button type="button" className="primary" disabled={status === 'saving'} onClick={() => void save()}>
        {status === 'saving' ? 'Saving…' : 'Save to Zotero'}
      </button>

      <div className="form-footer">
        <BackButton onClick={back} />
      </div>
    </main>
  );
}
