import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { companionRequest, type Ancestry2Person } from '../ancestry2/browser-transport.mjs';
import { ancestryPersonUrl, useAncestry2Flow } from '../ancestry2/flow';
import { track } from '../analytics';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';

/**
 * ancestry2-search — find the person in one of the user's Ancestry trees. Ancestry's tree
 * search takes a single name string, so given name and surname are joined.
 */
export function Ancestry2Search() {
  const navigate = useNavigate();
  const [flow, update] = useAncestry2Flow();
  const [people, setPeople] = useState<Ancestry2Person[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const account = flow.account;
  const name = `${flow.givenName} ${flow.surname}`.trim();

  useEffect(() => {
    if (!account || !flow.source) navigate('/ancestry2', { replace: true });
  }, [account, flow.source, navigate]);

  async function search(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    if (!name || !flow.treeId || busy) return;
    setBusy(true);
    setError('');
    track('ancestry2_search');
    try {
      const result = await companionRequest<{ people: Ancestry2Person[] }>('search', { treeId: flow.treeId, name });
      setPeople(result.people);
    } catch (err) {
      setPeople(null);
      setError(err instanceof Error ? err.message : 'Ancestry search failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function choose(person: Ancestry2Person): void {
    update({ selected: person, saved: null });
    navigate('/ancestry2-attach');
  }

  if (!account || !flow.source) return null;

  return (
    <main>
      <h1>Search for an existing person</h1>
      <form onSubmit={(e) => void search(e)}>
        {account.trees.length === 0 ? (
          <p role="alert">You don’t have a tree on Ancestry yet. Create one on Ancestry, then come back.</p>
        ) : (
          <div className="field">
            <label className="field-label" htmlFor="ancestry2-tree">
              Tree
            </label>
            <select
              id="ancestry2-tree"
              value={flow.treeId}
              onChange={(e) => {
                update({ treeId: e.target.value });
                setPeople(null);
              }}
            >
              {account.trees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-grid">
          <label>
            Given Name(s)
            <input value={flow.givenName} onChange={(e) => update({ givenName: e.target.value })} />
          </label>
          <label>
            Last Names (Surname)
            <input value={flow.surname} onChange={(e) => update({ surname: e.target.value })} />
          </label>
        </div>
        <div className="form-footer">
          <BackButton onClick={() => navigate('/ancestry2')}>Modify Source</BackButton>
          <div className="footer-right">
            <ForwardButton type="submit" disabled={!name || !flow.treeId || busy}>
              {busy ? 'Searching…' : 'Search'}
            </ForwardButton>
          </div>
        </div>
      </form>

      {error && <p role="alert">{error}</p>}
      {people !== null && people.length === 0 && <p>No one in this tree matches that name.</p>}
      {people !== null && people.length > 0 && (
        <table className="results-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Person</th>
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.personId}>
                <td className="select-cell">
                  <button type="button" className="btn-success" onClick={() => choose(person)}>
                    Select
                  </button>
                </td>
                <td className="person">
                  <span
                    className={`gender gender-${person.gender === 'male' ? 'Male' : person.gender === 'female' ? 'Female' : 'Unknown'}`}
                    aria-hidden="true"
                  />
                  <a href={ancestryPersonUrl(flow.treeId, person.personId)} target="_blank" rel="noreferrer">
                    {person.name}
                  </a>
                  {person.living && <div className="pid">Living</div>}
                </td>
                <td className="events" data-label="Events">
                  {person.birth && (
                    <div>
                      <strong>b.</strong> {person.birth}
                    </div>
                  )}
                  {person.death && (
                    <div>
                      <strong>d.</strong> {person.death}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
