import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../session/SessionContext';
import { useCapture } from '../capture/CaptureContext';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';
import { TagEventsButton } from '../components/TagEventsButton';
import { MarriageTagger } from '../components/MarriageTagger';

/**
 * fs-attach — confirm the target person, optionally tag which events the source
 * supports, and write a reason. No FamilySearch writes happen here; that's
 * fs-create. The legacy entry guard dereferenced `data.attach.justification`
 * after a no-`return` redirect (a Sentry TypeError); here we guard-and-return.
 */
export function FsAttach() {
  const { state, setJustification } = useSession();
  const navigate = useNavigate();
  const capture = useCapture();
  const attach = state.attach;

  useEffect(() => {
    if (!attach) {
      navigate(state.search.pid ? '/fs-search' : '/fs-results', { replace: true });
    }
  }, [attach, state.search.pid, navigate]);

  if (!attach) {
    return null;
  }

  return (
    <main>
      <div className="attach-header">
        <h3 className="attach-title">
          Attach Source to{' '}
          <a href={attach.url} target="_blank" rel="noreferrer">
            {attach.name}
          </a>
        </h3>
        <TagEventsButton />
      </div>
      <MarriageTagger pid={attach.pid} />
      <p>Source: &quot;{capture.title}&quot;</p>

      <label>
        Reason to Attach this Source to this Person (Optional)
        <textarea value={attach.justification} onChange={(e) => setJustification(e.target.value)} rows={5} />
      </label>

      <div className="form-footer">
        <BackButton onClick={() => navigate(state.search.pid ? '/fs-search' : '/fs-results')} />
        <div className="footer-right">
          <ForwardButton onClick={() => navigate('/fs-create')}>Create &amp; Attach</ForwardButton>
        </div>
      </div>
    </main>
  );
}
