import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { formatCitation, CITATION_STYLES, CITATION_STYLE_LABELS, type CitationStyle } from '@recordseek/core';
import { track } from '../analytics';
import { useCapture, type Capture } from '../capture/CaptureContext';
import { usePersistedCitationStyle, clearLastService } from '../prefs';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';

import {
  ANCESTRY_ACTION, ANCESTRY_FIELDS, startAncestrySave,
  type AncestryPayload, type AncestrySave, type AncestrySaveStatus,
} from '../lib/ancestry-save';
// Absolute URL: Ancestry fetches this image itself. Bundled with the app so it
// works wherever /share/ is deployed.
const DEFAULT_MEDIA = `${window.location.origin}${import.meta.env.BASE_URL}images/ancestry.jpg`;

function citationFor(capture: Capture, style: CitationStyle): string {
  return formatCitation(
    {
      sourceType: 'website',
      title: capture.title,
      publisher: capture.publisher,
      url: capture.url,
      accessedDate: capture.accessedDate,
    },
    style,
  );
}

/**
 * Ancestry owns sign-in, person selection, and saving in its popup.
 * Keep the native form as a fallback for blocked popups and other origins.
 */
export function ASource() {
  const capture = useCapture();
  const navigate = useNavigate();
  const [style, setStyle] = usePersistedCitationStyle();
  const [title, setTitle] = useState(capture.title);
  const [url, setUrl] = useState(capture.url);
  const [mediaUrl, setMediaUrl] = useState(DEFAULT_MEDIA);
  const [citation, setCitation] = useState(() => citationFor(capture, style));
  const [notes, setNotes] = useState(capture.notes);

  const activeSave = useRef<AncestrySave | null>(null);
  const [saveStatus, setSaveStatus] = useState<AncestrySaveStatus | null>(null);

  useEffect(() => () => activeSave.current?.dispose(), []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    activeSave.current?.dispose();
    activeSave.current = null;
    setSaveStatus(null);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const sameTab = submitter instanceof HTMLElement && submitter.dataset.ancestryFallback === 'true';
    if (!sameTab) {
      const form = new FormData(event.currentTarget);
      const payload = Object.fromEntries(
        ANCESTRY_FIELDS.map((name) => [name, String(form.get(name) ?? '')]),
      ) as AncestryPayload;
      activeSave.current = startAncestrySave(payload, setSaveStatus);
      if (activeSave.current) event.preventDefault();
    }
    track('ancestry_submitted', undefined, { beacon: true });
  }

  useEffect(() => {
    track('ancestry_form_viewed');
  }, []);

  function changeStyle(next: CitationStyle): void {
    setStyle(next);
    setCitation(citationFor(capture, next));
  }

  return (
    <main>
      <h3>
        Attach a Source <small>to Ancestry.com</small>
      </h3>
      <form
        action={ANCESTRY_ACTION}
        method="POST"
        onSubmit={submit}
      >
        <div className="field">
          <label className="field-label" htmlFor="a-title">
            Source Title
          </label>
          <input id="a-title" name="sourceTitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="a-url">
            Source <span className="field-hint">(URL)</span>
          </label>
          <input id="a-url" name="citationUrl" value={url} onChange={(e) => setUrl(e.target.value)} required />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="a-media">
            Source Media Image <span className="field-hint">(URL)</span>
          </label>
          <div className="input-with-action">
            <input id="a-media" name="mediaUrl" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
            <button
              type="button"
              className="input-clear"
              onClick={() => setMediaUrl('')}
              aria-label="Clear media image URL"
              title="Clear"
            >
              ×
            </button>
          </div>
        </div>

        <div className="field">
          <div className="citation-label-row">
            <label className="field-label" htmlFor="a-citation">
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
            id="a-citation"
            name="citationTitle"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
            rows={3}
            required
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="a-notes">
            Describe the Record <span className="field-hint">(Notes)</span>
          </label>
          <textarea id="a-notes" name="mediaNote" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        <input type="hidden" name="repositoryDomain" value={capture.domain} />
        <input type="hidden" name="sourcePublisherName" value={capture.domain} />
        <input type="hidden" name="sourcePublishedDate" value="" />
        <input type="hidden" name="sourcePublishedLocation" value="" />

        {saveStatus && (
          <div role="status">
            <p>{saveStatus === 'saved' ? 'Ancestry confirmed that your source was saved.'
              : saveStatus === 'error' ? 'Ancestry could not complete the save. Try again or continue in this tab.'
              : saveStatus === 'closed' ? 'The Ancestry window was closed. You can try again.'
              : 'Continue in the Ancestry window to sign in and choose a person. If it does not open, continue in this tab.'}</p>
            {saveStatus !== 'saved' && (
              <button type="submit" data-ancestry-fallback="true">
                Continue in this tab
              </button>
            )}
          </div>
        )}

        <div className="form-footer">
          <BackButton
            onClick={() => {
              clearLastService();
              navigate('/');
            }}
          />
          <ForwardButton type="submit">Next</ForwardButton>
        </div>
      </form>
    </main>
  );
}
