import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatCitation, CITATION_STYLES, CITATION_STYLE_LABELS, type CitationStyle } from '@recordseek/core';
import { useCapture, type Capture } from '../capture/CaptureContext';
import { useSession } from '../session/SessionContext';
import { usePersistedCitationStyle, clearLastService } from '../prefs';
import { isFsAuthenticated, beginFsLogin } from '../fsAuth';
import { Loading } from './Loading';
import { reportError } from '../sentry';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';
import { TagEventsButton } from '../components/TagEventsButton';

/** The URL as FamilySearch will accept it (encoded, absolute http/https), or null. */
export function toSourceUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function citationFor(capture: Capture, title: string, url: string, style: CitationStyle): string {
  return formatCitation(
    { sourceType: 'website', title, publisher: capture.publisher, url, accessedDate: capture.accessedDate },
    style,
  );
}

/** fs-source — review/finalize the source citation, then move on to find the person. */
export function Source() {
  const capture = useCapture();
  const navigate = useNavigate();
  const { setDraft, clearAttach, setComplete } = useSession();
  const [style, setStyle] = usePersistedCitationStyle();
  const [title, setTitle] = useState(capture.title);
  const [url, setUrl] = useState(capture.url);
  const [notes, setNotes] = useState(capture.notes);
  const [citation, setCitation] = useState(() => citationFor(capture, capture.title, capture.url, style));
  const [authed] = useState(() => isFsAuthenticated());
  const [loginError, setLoginError] = useState(false);

  // The FamilySearch flow requires a signed-in user — kick off OAuth on entry.
  useEffect(() => {
    if (!authed) {
      beginFsLogin('/fs-source').catch((err: unknown) => {
        reportError(err, { screen: 'fs-source', step: 'begin_login' });
        setLoginError(true);
      });
    }
  }, [authed]);

  function changeStyle(next: CitationStyle): void {
    setStyle(next);
    setCitation(citationFor(capture, title, url, next));
  }

  // Editing the title or URL rebuilds the citation from them.
  function changeTitle(next: string): void {
    setTitle(next);
    setCitation(citationFor(capture, next, url, style));
  }

  function changeUrl(next: string): void {
    setUrl(next);
    setCitation(citationFor(capture, title, next, style));
  }

  // FamilySearch rejects a source without a title or with an about that isn't a URL.
  const sourceUrl = toSourceUrl(url);
  const ready = title.trim() !== '' && sourceUrl !== null;

  function goNext(): void {
    if (!ready || !sourceUrl) return;
    setDraft({ url: sourceUrl, title, citation, notes });
    navigate('/fs-search');
  }

  function saveWithoutAttaching(): void {
    if (!ready || !sourceUrl) return;
    setDraft({ url: sourceUrl, title, citation, notes });
    clearAttach();
    setComplete('noAttachment');
    navigate('/fs-create');
  }

  if (!authed && loginError) {
    return (
      <main>
        <h3>Couldn’t connect to FamilySearch</h3>
        <p role="alert">Signing in to FamilySearch didn’t start. Reload the page and try again.</p>
        <div className="form-footer">
          <BackButton onClick={() => navigate('/')} />
        </div>
      </main>
    );
  }
  if (!authed) {
    return <Loading status="Connecting to FamilySearch…" />;
  }

  return (
    <main>
      <div className="attach-header">
        <h2 className="attach-title">Attach a Source</h2>
        <TagEventsButton />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="source-title">
          Source Title
        </label>
        <input id="source-title" value={title} onChange={(e) => changeTitle(e.target.value)} required />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="source-url">
          Source <span className="field-hint">(URL)</span>
        </label>
        <input id="source-url" value={url} onChange={(e) => changeUrl(e.target.value)} required />
      </div>

      <div className="field">
        <div className="citation-label-row">
          <label className="field-label" htmlFor="source-citation">
            Where the Record Is Found <span className="field-hint">(Citation)</span>
          </label>
          <span className="format-inline">
            <span className="field-hint">Format</span>
            <select
              aria-label="Citation format"
              value={style}
              onChange={(e) => changeStyle(e.target.value as CitationStyle)}
            >
              {CITATION_STYLES.map((s) => (
                <option key={s} value={s}>
                  {CITATION_STYLE_LABELS[s]}
                </option>
              ))}
            </select>
          </span>
        </div>
        <textarea
          id="source-citation"
          aria-label="Citation"
          value={citation}
          onChange={(e) => setCitation(e.target.value)}
          rows={3}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="source-notes">
          Describe the Record <span className="field-hint">(Notes)</span>
        </label>
        <textarea id="source-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <p className="field-hint save-later-hint">
        Not sure who it belongs to yet? <strong>Save Now, Attach Later</strong> files it in your FamilySearch Source
        Box. Attach it any time from a person&apos;s Sources section on FamilySearch.
      </p>

      <div className="form-footer">
        <BackButton
          onClick={() => {
            clearLastService();
            navigate('/');
          }}
        />
        <div className="footer-right">
          <button type="button" className="btn-sm btn-save-later" onClick={saveWithoutAttaching} disabled={!ready}>
            Save Now, Attach Later
          </button>
          <ForwardButton onClick={goNext} disabled={!ready}>
            Next
          </ForwardButton>
        </div>
      </div>
    </main>
  );
}
