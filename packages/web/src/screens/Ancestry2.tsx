import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatCitation, type CitationStyle } from '@recordseek/core';
import { companionRequest, type Ancestry2Context, type Ancestry2Journal, type Ancestry2Status } from '../ancestry2/browser-transport.mjs';
import { useCapture } from '../capture/CaptureContext';
import { track } from '../analytics';
import { clearLastService, usePersistedCitationStyle } from '../prefs';
import { BackButton } from '../components/BackButton';

const LAST_JOB_KEY = 'recordseek-ancestry2-last-job';

interface SavedJob {
  jobId: string;
}

function citationFor(
  capture: ReturnType<typeof useCapture>,
  title: string,
  url: string,
  style: CitationStyle,
): string {
  return formatCitation(
    {
      sourceType: 'website',
      title,
      publisher: capture.publisher,
      url,
      accessedDate: capture.accessedDate,
    },
    style,
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return value.length <= 8000 && ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function ancestryPersonUrl(context: Ancestry2Context): string {
  return `https://www.ancestry.com/family-tree/person/tree/${encodeURIComponent(context.treeId)}/person/${encodeURIComponent(context.personId)}/facts`;
}

function jobMessage(journal: Ancestry2Journal): string {
  if (journal.state !== 'complete') return 'The save result is pending or unknown. Check Ancestry before starting another save.';
  const result = journal.result;
  if (result?.ok && result.verified && result.sourceId && result.citationId) {
    return 'Save verified by Ancestry. Check the person before starting another save.';
  }
  return result?.message || 'The save was not verified. Check Ancestry before starting another save.';
}

export function Ancestry2() {
  const capture = useCapture();
  const navigate = useNavigate();
  const [style] = usePersistedCitationStyle();
  const [title, setTitle] = useState(capture.title);
  const [url, setUrl] = useState(capture.url);
  const [detail, setDetail] = useState(() => citationFor(capture, capture.title, capture.url, style));
  const [note, setNote] = useState(capture.notes);
  const [status, setStatus] = useState<Ancestry2Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [journal, setJournal] = useState<Ancestry2Journal | null>(null);
  const [lastJob, setLastJob] = useState<SavedJob | null>(() => {
    try {
      const raw = sessionStorage.getItem(LAST_JOB_KEY);
      return raw ? (JSON.parse(raw) as SavedJob) : null;
    } catch {
      return null;
    }
  });

  const context = status?.connected ? status.context : undefined;
  const canSave = Boolean(context && title.trim() && detail.trim() && isHttpUrl(url) && !busy && !lastJob);
  const zipUrl = `${import.meta.env.BASE_URL}ancestry2-companion.zip`;

  const personHref = useMemo(
    () => (context && journal?.result ? ancestryPersonUrl(context) : null),
    [context, journal],
  );

  useEffect(() => {
    void checkConnection();
    // Connection status is deliberately refreshed only by an explicit check after this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkConnection(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const next = await companionRequest<Ancestry2Status>('status');
      setStatus(next);
      if (!next.connected) setMessage(next.message || 'Open a signed-in Ancestry person tab, click the companion toolbar action, then check again.');
    } catch (error) {
      setStatus({ connected: false });
      setMessage(error instanceof Error ? error.message : 'Could not check the Ancestry companion.');
    } finally {
      setBusy(false);
    }
  }

  async function checkLastSave(): Promise<void> {
    if (!lastJob || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const next = await companionRequest<Ancestry2Journal>('job', { jobId: lastJob.jobId });
      setJournal(next);
      setMessage(jobMessage(next));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not check the previous save. Check Ancestry before trying again.');
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (!context || !title.trim() || !detail.trim() || !isHttpUrl(url) || busy || lastJob) return;
    const requestId = crypto.randomUUID();
    try {
      sessionStorage.setItem(LAST_JOB_KEY, JSON.stringify({ jobId: requestId }));
    } catch {
      setMessage('This browser cannot save the last-job record, so no write was sent. Enable session storage and try again.');
      return;
    }
    setLastJob({ jobId: requestId });
    setBusy(true);
    setMessage('Saving to the displayed Ancestry person…');
    try {
      const next = await companionRequest<Ancestry2Journal>(
        'save',
        { target: { treeId: context.treeId, personId: context.personId }, source: { title: title.trim(), note }, citation: { detail, url } },
        { requestId },
      );
      setJournal(next);
      setMessage(jobMessage(next));
      track('ancestry2_save_requested');
    } catch (error) {
      setJournal({ state: 'pending' });
      setMessage(error instanceof Error ? error.message : 'Save outcome unknown. Check Ancestry before trying again.');
    } finally {
      setBusy(false);
    }
  }

  function acknowledge(): void {
    try {
      sessionStorage.removeItem(LAST_JOB_KEY);
    } catch {
      setMessage('This browser cannot clear the last-job record. Enable session storage before starting a new save.');
      return;
    }
    setLastJob(null);
    setJournal(null);
    setMessage('Ready for a new save. Confirm the displayed Ancestry person first.');
  }

  return (
    <main>
      <h3>Save to Ancestry2 <small>with the Chrome companion</small></h3>
      <p>
        Install the separate Chrome companion: <a href={zipUrl} download>download the ZIP</a>, unzip it, then open Chrome Extensions,
        enable Developer mode, and choose Load unpacked. On the signed-in Ancestry person tab, click the companion toolbar action, then return here and reload this page.
      </p>
      <p>This saves only to the person currently displayed by the companion. Chrome is required.</p>
      <p>
        <button type="button" onClick={() => void checkConnection()} disabled={busy}>Check connection</button>
        {context ? <span role="status"> Connected to {context.personName || 'the displayed person'}.</span> : null}
      </p>
      {context && <p>Tree {context.treeId} · Person {context.personId}</p>}

      <div className="field">
        <label className="field-label" htmlFor="ancestry2-title">Source Title</label>
        <input id="ancestry2-title" maxLength={1000} value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ancestry2-url">Source <span className="field-hint">(URL)</span></label>
        <input id="ancestry2-url" maxLength={8000} value={url} onChange={(e) => setUrl(e.target.value)} required />
        {!isHttpUrl(url) && <p role="alert">Enter an http(s) source URL before saving.</p>}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ancestry2-detail">Where the Record Is Found <span className="field-hint">(Citation)</span></label>
        <textarea id="ancestry2-detail" maxLength={50000} value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ancestry2-note">Describe the Record <span className="field-hint">(Notes)</span></label>
        <textarea id="ancestry2-note" maxLength={50000} value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </div>

      {message && <p role="status">{message}</p>}
      {journal?.result && (journal.result.sourceId || journal.result.citationId) && (
        <p>
          {journal.result.sourceId ? `Source ID: ${journal.result.sourceId}` : 'Source ID was not returned.'}
          {' '}
          {journal.result.citationId ? `Citation ID: ${journal.result.citationId}` : 'Citation ID was not returned.'}
        </p>
      )}
      {personHref && <p><a href={personHref} target="_blank" rel="noopener noreferrer">Open this person in Ancestry</a></p>}
      {lastJob ? (
        <div className="form-footer">
          <button type="button" onClick={() => void checkLastSave()} disabled={busy}>Check last save</button>
          <button type="button" onClick={acknowledge} disabled={busy}>I checked Ancestry; start a new save</button>
        </div>
      ) : (
        <button type="button" className="primary" onClick={() => void save()} disabled={!canSave}>Save to displayed person</button>
      )}
      <div className="form-footer">
        <BackButton onClick={() => { clearLastService(); navigate('/'); }} />
      </div>
    </main>
  );
}
