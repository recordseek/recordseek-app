import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import { useCapture } from '../capture/CaptureContext';
import { clearGeniToken, geniLoginUrl, getGeniToken } from '../geni';
import { clearLastService } from '../prefs';
import { useGeniFlow } from '../session/GeniContext';
import { useAutoSignIn } from '../auth/useAutoSignIn';
import { Loading } from './Loading';
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

  // Coming back with "Modify Source": restore what was edited, citation included.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !state.source) return;
    restored.current = true;
    onChange(state.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signIn(): void {
    track('geni_login_started');
    window.location.assign(geniLoginUrl());
  }

  const auth = useAutoSignIn('geni', Boolean(token), signIn);

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

  if (!token && auth.redirecting) return <Loading status="Signing in to Geni…" />;
  if (!token) {
    return (
      <main>
        <h3>Couldn’t connect to Geni</h3>
        <p role="alert">Geni sign-in didn’t finish. Please try again.</p>
        <button type="button" className="primary" onClick={auth.retry}>
          Try again
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
