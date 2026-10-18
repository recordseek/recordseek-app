import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { CITATION_STYLES, CITATION_STYLE_LABELS, type CitationStyle } from '@recordseek/core';
import { track } from '../analytics';
import { useCapture } from '../capture/CaptureContext';
import { captureCitation } from '../citationText';
import { usePersistedCitationStyle, clearLastService } from '../prefs';
import { isValidWikiTreeId, wikiTreeEditUrl, wikiTreeRef } from '../wikitree';
import { BackButton } from '../components/BackButton';

/**
 * WikiTree has no write API: format the citation as a `<ref>` block to paste,
 * and open the profile's edit page (given its WikiTree ID, like Smith-123).
 */
export function WikiTree() {
  const capture = useCapture();
  const navigate = useNavigate();
  const [style, setStyle] = usePersistedCitationStyle();
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState(false);
  const [wikiId, setWikiId] = useState('');
  const [idError, setIdError] = useState(false);

  useEffect(() => {
    track('wikitree_viewed');
  }, []);

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

  function openEditor(): void {
    if (!isValidWikiTreeId(wikiId)) {
      setIdError(true);
      track('wikitree_invalid_id');
      return;
    }
    setIdError(false);
    track('wikitree_opened');
    window.open(wikiTreeEditUrl(wikiId), '_blank', 'noopener');
  }

  return (
    <main>
      <h3>Add to WikiTree</h3>
      <p>WikiTree can’t take a source automatically. Copy the reference below, then paste it into the profile’s biography.</p>

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
