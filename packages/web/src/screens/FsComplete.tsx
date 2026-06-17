import { useNavigate } from 'react-router-dom';
import { useSession } from '../session/SessionContext';

const SOURCE_BOX_URL = 'https://www.familysearch.org/search/sourcebox';

/**
 * fs-complete — terminal confirmation. Renders one of three states from
 * session.complete (source-box-only / attached-to-person / error). The legacy
 * dead links ($parent.treeViewURL, datasourceDescription.url, the hidden
 * SourceBox link, the no-op Tree/Profile buttons) are dropped. "Attach to
 * Another" keeps the created source id so the next attach reuses it.
 */
export function FsComplete() {
  const { state, clearAttach, clearNewPerson } = useSession();
  const navigate = useNavigate();
  const complete = state.complete;
  const title = state.draft?.title ?? '';

  function attachAnother(): void {
    // Keep draft + createdSourceId so the source is reused; clear the person
    // selection (existing and new) so the next attach starts fresh.
    clearAttach();
    clearNewPerson();
    navigate('/fs-search');
  }

  if (complete === 'noAttachment') {
    return (
      <main>
        <h3>Congratulations! Your source was created and added to your FamilySearch source box.</h3>
        {title && <p>“{title}”</p>}
        <p>
          <a href={SOURCE_BOX_URL} target="_blank" rel="noreferrer">
            View your source box on FamilySearch
          </a>
        </p>
        <button type="button" onClick={attachAnother}>
          Attach to a Person
        </button>
        <p>You may now close this window.</p>
      </main>
    );
  }

  if (complete) {
    return (
      <main>
        <h3>Congratulations! Your source was attached to {complete.name}.</h3>
        {title && <p>“{title}”</p>}
        <p>
          <a href={complete.url} target="_blank" rel="noreferrer">
            View Profile on FamilySearch
          </a>
        </p>
        <button type="button" onClick={attachAnother}>
          Attach to Another Person
        </button>
        <p>You may now close this window.</p>
      </main>
    );
  }

  return (
    <main>
      <h3>There seems to have been an error creating your source. Please try again.</h3>
      <button type="button" onClick={() => navigate('/fs-source')}>
        Start over
      </button>
    </main>
  );
}
