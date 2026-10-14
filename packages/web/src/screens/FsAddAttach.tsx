import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '../session/SessionContext';
import { useCapture } from '../capture/CaptureContext';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';

/**
 * fs-addattach — review the to-be-created person + source, capture a reason,
 * then hand off to fs-create which creates the person and attaches the source.
 * We stash a placeholder attach (empty pid) carrying the justification; fs-create
 * fills in the real pid/url after createPerson.
 */
export function FsAddAttach() {
  const { state, selectPerson } = useSession();
  const navigate = useNavigate();
  const capture = useCapture();
  const np = state.newPerson;
  const [justification, setJustification] = useState('');

  useEffect(() => {
    if (!np) {
      navigate('/fs-addperson', { replace: true });
    }
  }, [np, navigate]);

  if (!np) {
    return null;
  }

  const name = [np.givenName, np.surname].filter(Boolean).join(' ').trim() || '(unnamed)';

  function createAndAttach(): void {
    selectPerson({ pid: '', name, url: '', justification });
    navigate('/fs-create');
  }

  return (
    <main>
      <h3>Create &amp; Attach</h3>
      <p>
        Person to be created: <strong>{name}</strong> ({np.gender}
        {np.living ? ', Living' : ''})
      </p>
      {(np.birthDate || np.birthPlace) && (
        <p>
          Born: {np.birthDate} {np.birthPlace}
        </p>
      )}
      {!np.living && (np.deathDate || np.deathPlace) && (
        <p>
          Died: {np.deathDate} {np.deathPlace}
        </p>
      )}
      <p>Source: &quot;{capture.title}&quot;</p>

      <label>
        Reason to Attach this Source (Optional)
        <textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={4} />
      </label>

      <div className="form-footer">
        <BackButton onClick={() => navigate('/fs-addperson')}>Modify Person Data</BackButton>
        <ForwardButton onClick={createAndAttach}>Create &amp; Attach</ForwardButton>
      </div>
    </main>
  );
}
