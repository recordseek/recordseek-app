import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { companionRequest, type Ancestry2Status } from '../ancestry2/browser-transport.mjs';
import { useAncestry2Flow } from '../ancestry2/flow';
import { useCapture } from '../capture/CaptureContext';
import { track } from '../analytics';
import { clearLastService } from '../prefs';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';
import { Modal } from '../components/Modal';
import { SourceFields, useSourceFields } from '../components/SourceFields';
import { toSourceUrl } from './Source';
import { Loading } from './Loading';

type Connection = 'checking' | 'missing' | 'outdated' | 'signin' | 'ready';

/** How often to look for a finished Ancestry sign-in while the sign-in dialog is up. */
const SIGN_IN_POLL_MS = 4000;

/**
 * ancestry2 — step 1 of the Ancestry2 flow, same as FamilySearch's: connect, then edit the
 * source. Next goes to ancestry2-search, then ancestry2-attach and ancestry2-complete.
 * Ancestry has no public API, so the RecordSeek Ancestry2 companion extension makes the
 * calls from a www.ancestry.com tab with the user's own session. Signed out, we bring
 * Ancestry's sign-in page to the front and continue once it succeeds.
 */
export function Ancestry2() {
  const capture = useCapture();
  const navigate = useNavigate();
  const [flow, update] = useAncestry2Flow();
  const { values, style, onChange, setStyle } = useSourceFields(capture);
  const [connection, setConnection] = useState<Connection>(flow.account ? 'ready' : 'checking');
  const signInOpened = useRef(false);
  const inFlight = useRef(false);
  const zipUrl = `${import.meta.env.BASE_URL}ancestry2-companion.zip`;

  useEffect(() => {
    track('ancestry2_viewed');
  }, []);

  // Coming back with "Modify Source": restore what was edited, citation included.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !flow.source) return;
    restored.current = true;
    onChange(flow.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    let status: Ancestry2Status;
    try {
      status = await companionRequest<Ancestry2Status>('status');
    } catch {
      setConnection('missing');
      return;
    } finally {
      inFlight.current = false;
    }
    if (!status.version) {
      setConnection('outdated');
      return;
    }
    if (!status.signedIn || !status.userId) {
      update({ account: null });
      setConnection('signin');
      return;
    }
    const account = { userId: status.userId, trees: status.trees ?? [], recentTreeId: status.recentTreeId ?? '' };
    const treeId = account.trees.some((t) => t.id === flow.treeId) ? flow.treeId : account.recentTreeId;
    update({ account, treeId });
    setConnection('ready');
  }

  // Always confirm the session on entry; a remembered account shows the form meanwhile.
  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openSignIn(): void {
    track('ancestry2_login_started');
    companionRequest('signin').catch(() => setConnection('missing'));
  }

  // Signed out: open Ancestry's sign-in once, then keep checking until it succeeds.
  useEffect(() => {
    if (connection !== 'signin') return;
    if (!signInOpened.current) {
      signInOpened.current = true;
      openSignIn();
    }
    const timer = setInterval(() => void check(), SIGN_IN_POLL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  function back(): void {
    clearLastService();
    navigate('/');
  }

  const sourceUrl = toSourceUrl(values.url);
  const ready =
    connection === 'ready' && values.title.trim() !== '' && sourceUrl !== null && values.citation.trim() !== '';

  function next(event: FormEvent): void {
    event.preventDefault();
    if (!ready || !sourceUrl) return;
    update({ source: { ...values, url: sourceUrl }, selected: null, saved: null });
    navigate('/ancestry2-search');
  }

  if (connection === 'checking') return <Loading status="Connecting to Ancestry…" />;

  return (
    <main>
      <div className="attach-header">
        <h2 className="attach-title">Attach a Source</h2>
      </div>
      <form onSubmit={next}>
        <SourceFields idPrefix="ancestry2" values={values} style={style} onChange={onChange} onStyleChange={setStyle} />
        <div className="form-footer">
          <BackButton onClick={back} />
          <div className="footer-right">
            <ForwardButton type="submit" disabled={!ready}>
              Next
            </ForwardButton>
          </div>
        </div>
      </form>

      {(connection === 'missing' || connection === 'outdated') && (
        <Modal
          title={connection === 'missing' ? 'Install the Ancestry2 companion' : 'Update the Ancestry2 companion'}
          onClose={back}
        >
          <p>
            Ancestry doesn’t offer an API, so RecordSeek saves through a small Chrome companion that uses your own
            Ancestry sign-in.
          </p>
          <ol>
            <li>
              <a href={zipUrl} download>
                Download the companion
              </a>{' '}
              and unzip it.
            </li>
            <li>
              In Chrome, open Extensions, turn on Developer mode and choose Load unpacked
              {connection === 'outdated' ? ' (or press Reload on the existing companion)' : ''}.
            </li>
            <li>Reload this page.</li>
          </ol>
          <div className="modal-actions">
            <BackButton onClick={back} />
            <button type="button" className="primary" onClick={() => window.location.reload()}>
              Check Again
            </button>
          </div>
        </Modal>
      )}

      {connection === 'signin' && (
        <Modal title="Sign in to Ancestry" onClose={back}>
          <p>
            We opened Ancestry’s sign-in page in another tab. Sign in there, then come back. This page continues on its
            own.
          </p>
          <p className="field-hint" role="status">
            Waiting for Ancestry sign-in…
          </p>
          <div className="modal-actions">
            <BackButton onClick={back} />
            <button type="button" className="primary" onClick={openSignIn}>
              Open Sign-in Again
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
