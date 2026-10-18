import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import { useCapture } from '../capture/CaptureContext';
import { clearGeniToken, geniLoginUrl, getGeniToken } from '../geni';
import { clearLastService } from '../prefs';
import { useGeniFlow } from '../session/GeniContext';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';
import { SourceFields, useSourceFields } from '../components/SourceFields';

/**
 * geni — step 1 of the Geni flow: sign in, then edit the source. Next goes to the
 * person search (geni-search), then geni-results, geni-attach and geni-complete.
 * Sign-in is the OAuth implicit flow (see geni-callback.html); login only works on
 * recordseek.com because Geni checks the redirect against the app's site domain.
 */
export function Geni() {
  const capture = useCapture();
  const navigate = useNavigate();
  const { state, setSource, clearAll } = useGeniFlow();
  const { values, style, onChange, setStyle } = useSourceFields(capture);
  const [token, setToken] = useState<string | null>(getGeniToken);

  useEffect(() => {
    track('geni_viewed');
  }, []);

  // Coming back with "Modify Source": restore what was edited. Title first, because
  // changing it regenerates the citation, which the second patch then overrides.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !state.source) return;
    restored.current = true;
    onChange({ title: state.source.title });
    onChange({ url: state.source.url, citation: state.source.citation, notes: state.source.notes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signIn(): void {
    track('geni_login_started');
    window.location.assign(geniLoginUrl());
  }

  function signOut(): void {
    clearGeniToken();
    clearAll();
    setToken(null);
  }

  function back(): void {
    clearLastService();
    navigate('/');
  }

  function next(event: FormEvent): void {
    event.preventDefault();
    if (!values.title.trim() || !values.url.trim()) return;
    setSource(values);
    navigate('/geni-search');
  }

  if (!token) {
    return (
      <main>
        <h3>Save to Geni</h3>
        <p>Sign in to Geni so RecordSeek can add this page as a document on a profile.</p>
        <button type="button" className="primary" onClick={signIn}>
          Sign in to Geni
        </button>
        <div className="form-footer">
          <BackButton onClick={back} />
        </div>
      </main>
    );
  }

  return (
    <main>
      <h3>Attach a Source</h3>
      <p>
        <button type="button" className="link-button" onClick={signOut}>
          Sign out
        </button>
      </p>
      <form onSubmit={next}>
        <SourceFields idPrefix="geni" values={values} style={style} onChange={onChange} onStyleChange={setStyle} />
        <div className="form-footer">
          <BackButton onClick={back} />
          <div className="footer-right">
            <ForwardButton type="submit" disabled={!values.title.trim() || !values.url.trim()}>
              Next
            </ForwardButton>
          </div>
        </div>
      </form>
    </main>
  );
}
