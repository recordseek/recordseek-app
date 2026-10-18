import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import { useCapture } from '../capture/CaptureContext';
import { clearLastService } from '../prefs';
import { BackButton } from '../components/BackButton';
import { SourceFields, useSourceFields } from '../components/SourceFields';

/**
 * "Save Citation": no account needed. The same Source Title, Source
 * (URL) and Citation fields as the FamilySearch screen; editing the title or
 * URL rebuilds the citation, which copies with one click.
 */
export function JustCitation() {
  const capture = useCapture();
  const navigate = useNavigate();
  const { values, style, onChange, setStyle } = useSourceFields(capture);
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState(false);

  useEffect(() => {
    track('citation_viewed');
  }, []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(values.citation);
      track('citation_copied');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (permissions, insecure context): select it for a manual copy.
      const box = document.getElementById('jc-citation') as HTMLTextAreaElement | null;
      box?.focus();
      box?.select();
      setCopyHint(true);
    }
  }

  return (
    <main>
      <h3>Your Citation</h3>

      <SourceFields
        values={values}
        style={style}
        onChange={onChange}
        onStyleChange={setStyle}
        idPrefix="jc"
        showNotes={false}
      />
      <button type="button" className="primary" onClick={() => void copy()}>
        {copied ? 'Copied!' : 'Copy citation'}
      </button>
      {copyHint && <p role="status">Couldn’t copy automatically. The citation is selected; press Ctrl+C (⌘C on a Mac).</p>}

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
