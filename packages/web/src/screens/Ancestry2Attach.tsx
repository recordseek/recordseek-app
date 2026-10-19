import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { companionRequest, type Ancestry2Journal } from '../ancestry2/browser-transport.mjs';
import { ancestryPersonUrl, useAncestry2Flow } from '../ancestry2/flow';
import { track } from '../analytics';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';
import { Loading } from './Loading';

/**
 * ancestry2-attach — confirm the person and save: the companion creates the source in the
 * tree, then a citation on the person. A save whose outcome is unknown is never retried
 * automatically; the user checks Ancestry first, because a retry could duplicate the source.
 */
export function Ancestry2Attach() {
  const navigate = useNavigate();
  const [flow, update] = useAncestry2Flow();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** A save may have written something: the user must look on Ancestry before another try. */
  const [mustCheck, setMustCheck] = useState(Boolean(flow.jobId));
  const { account, source, selected } = flow;
  const tree = account?.trees.find((t) => t.id === flow.treeId);
  const personUrl = selected ? ancestryPersonUrl(flow.treeId, selected.personId) : '';

  useEffect(() => {
    if (!account || !source || !selected) navigate('/ancestry2', { replace: true });
  }, [account, source, selected, navigate]);

  function finish(journal: Ancestry2Journal): void {
    const result = journal.result;
    if (journal.state === 'complete' && result?.ok && result.verified && selected) {
      track('ancestry2_saved');
      update({ jobId: null, saved: { personName: selected.name, personUrl: result.personUrl || personUrl } });
      navigate('/ancestry2-complete');
      return;
    }
    if (journal.state === 'complete' && result && !result.mayHaveWritten) {
      // Nothing reached Ancestry, so saving again is safe.
      update({ jobId: null });
      setMustCheck(false);
      setError(result.message || 'Ancestry didn’t save the source. Try again.');
      return;
    }
    setMustCheck(true);
    setError(
      result?.message
        ? `${result.message} Check the person on Ancestry before saving again.`
        : 'We couldn’t confirm the save. Check the person on Ancestry before saving again.',
    );
  }

  // Back here with a save on record (a reload mid-save): ask the companion how it ended.
  useEffect(() => {
    if (!flow.jobId) return;
    companionRequest<Ancestry2Journal>('job', { jobId: flow.jobId })
      .then(finish)
      .catch(() => finish({ state: 'pending' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(): Promise<void> {
    if (!account || !source || !selected || busy || mustCheck) return;
    const jobId = crypto.randomUUID();
    update({ jobId });
    setBusy(true);
    setError('');
    try {
      const journal = await companionRequest<Ancestry2Journal>(
        'save',
        {
          userId: account.userId,
          target: { treeId: flow.treeId, personId: selected.personId },
          source: { title: source.title.trim(), note: source.notes },
          citation: { detail: source.citation, url: source.url },
        },
        { requestId: jobId },
      );
      finish(journal);
    } catch {
      finish({ state: 'pending' });
    } finally {
      setBusy(false);
    }
  }

  function checked(): void {
    update({ jobId: null });
    setMustCheck(false);
    setError('');
  }

  if (!account || !source || !selected) return null;
  if (busy) return <Loading status="Saving to Ancestry…" />;

  return (
    <main>
      <div className="attach-header">
        <h3 className="attach-title">
          Attach Source to{' '}
          <a href={personUrl} target="_blank" rel="noreferrer">
            {selected.name}
          </a>
        </h3>
      </div>
      {(selected.birth || selected.death) && (
        <p className="field-hint">
          {[selected.birth && `b. ${selected.birth}`, selected.death && `d. ${selected.death}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {tree && <p className="field-hint">Tree: {tree.name}</p>}
      <p>Source: &quot;{source.title}&quot;</p>

      {error && <p role="alert">{error}</p>}
      {mustCheck && (
        <p>
          <a href={personUrl} target="_blank" rel="noreferrer">
            Open {selected.name} on Ancestry
          </a>{' '}
          ·{' '}
          <button type="button" className="link-button" onClick={checked}>
            I checked Ancestry; let me save again
          </button>
        </p>
      )}

      <div className="form-footer">
        <BackButton onClick={() => navigate('/ancestry2-search')}>Choose Another Person</BackButton>
        <div className="footer-right">
          <ForwardButton onClick={() => void save()} disabled={busy || mustCheck}>
            Save Source
          </ForwardButton>
        </div>
      </div>
    </main>
  );
}
