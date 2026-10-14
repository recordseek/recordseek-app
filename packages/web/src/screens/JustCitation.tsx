import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatCitation, CITATION_STYLES, CITATION_STYLE_LABELS, type CitationStyle } from '@recordseek/core';
import { useCapture } from '../capture/CaptureContext';
import { usePersistedCitationStyle, clearLastService } from '../prefs';
import { BackButton } from '../components/BackButton';

/**
 * "Just the Citation" — no FamilySearch/Ancestry account needed. Shows the
 * formatted citation (style switchable + persisted) with a one-click Copy, plus
 * the raw captured details to grab.
 */
export function JustCitation() {
  const capture = useCapture();
  const navigate = useNavigate();
  const [style, setStyle] = usePersistedCitationStyle();
  const [copied, setCopied] = useState(false);

  const citation = formatCitation(
    {
      sourceType: 'website',
      title: capture.title,
      publisher: capture.publisher,
      url: capture.url,
      accessedDate: capture.accessedDate,
    },
    style,
  );

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <main>
      <h3>Your Citation</h3>
      <p>Copy the citation below, or grab any of the captured details.</p>

      <div className="citation-label-row">
        <label className="field-label" htmlFor="jc-citation">
          Citation
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
      <textarea id="jc-citation" aria-label="Citation" readOnly value={citation} rows={4} />
      <button type="button" className="primary" onClick={() => void copy()}>
        {copied ? 'Copied!' : 'Copy citation'}
      </button>

      <hr />

      <p>
        <strong>Title:</strong> {capture.title || '—'}
      </p>
      <p>
        <strong>URL:</strong>{' '}
        {capture.url ? (
          <a href={capture.url} target="_blank" rel="noreferrer">
            {capture.url}
          </a>
        ) : (
          '—'
        )}
      </p>
      {capture.notes && (
        <p>
          <strong>Notes:</strong> {capture.notes}
        </p>
      )}

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
