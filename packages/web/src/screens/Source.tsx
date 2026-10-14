import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatCitation, CITATION_STYLES, CITATION_STYLE_LABELS, type CitationStyle } from '@recordseek/core';
import { useCapture, type Capture } from '../capture/CaptureContext';
import { useSession } from '../session/SessionContext';
import { usePersistedCitationStyle, usePersistedSaveToSourceBox, clearLastService } from '../prefs';
import { isFsAuthenticated, beginFsLogin } from '../fsAuth';
import { Loading } from './Loading';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';
import { TagEventsButton } from '../components/TagEventsButton';

function citationFor(capture: Capture, title: string, style: CitationStyle): string {
  return formatCitation(
    { sourceType: 'website', title, publisher: capture.publisher, url: capture.url, accessedDate: capture.accessedDate },
    style,
  );
}

/** fs-source — review/finalize the source citation, then move on to find the person. */
export function Source() {
  const capture = useCapture();
  const navigate = useNavigate();
  const { setDraft, clearAttach, setComplete } = useSession();
  const [style, setStyle] = usePersistedCitationStyle();
  const [saveToSourceBox, setSaveToSourceBox] = usePersistedSaveToSourceBox();
  const [title, setTitle] = useState(capture.title);
  const [url, setUrl] = useState(capture.url);
  const [notes, setNotes] = useState(capture.notes);
  const [citation, setCitation] = useState(() => citationFor(capture, capture.title, style));
  const [authed] = useState(() => isFsAuthenticated());

  // The FamilySearch flow requires a signed-in user — kick off OAuth on entry.
  useEffect(() => {
    if (!authed) {
      void beginFsLogin('/fs-source');
    }
  }, [authed]);

  function changeStyle(next: CitationStyle): void {
    setStyle(next);
    setCitation(citationFor(capture, title, next));
  }

  function goNext(): void {
    setDraft({ url, title, citation, notes });
    navigate('/fs-search');
  }

  function saveWithoutAttaching(): void {
    setDraft({ url, title, citation, notes });
    clearAttach();
    setComplete('noAttachment');
    navigate('/fs-create');
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
        <input id="source-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="source-url">
          Source <span className="field-hint">(URL)</span>
        </label>
        <input id="source-url" value={url} onChange={(e) => setUrl(e.target.value)} required />
      </div>

      <div className="field">
        <div className="citation-label-row">
          <label className="field-label" htmlFor="source-citation">
            Where the Record Is Found <span className="field-hint">(Citation)</span>
          </label>
          <span className="format-inline">
            <span className="field-hint">Format</span>
            <select aria-label="Citation format" value={style} onChange={(e) => changeStyle(e.target.value as CitationStyle)}>
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

      <div className="form-footer">
        <BackButton
          onClick={() => {
            clearLastService();
            navigate('/');
          }}
        />
        <div className="footer-right">
          <label className="field-hint" title="Also file this source in the RecordSeek folder of your FamilySearch Source Box">
            <input
              type="checkbox"
              checked={saveToSourceBox}
              onChange={(e) => setSaveToSourceBox(e.target.checked)}
            />
            Save to Source Box
          </label>
          <button type="button" className="btn-sm" onClick={saveWithoutAttaching}>
            Save Now, Attach Later
          </button>
          <ForwardButton onClick={goNext}>Next</ForwardButton>
        </div>
      </div>
    </main>
  );
}
