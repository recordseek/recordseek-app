import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import {
  describeGeniError,
  GENI_PAGE_SIZE,
  getProfile,
  hasClientFilters,
  isExpectedGeniError,
  parseGeniId,
  searchPeople,
  type GeniProfile,
} from '../geni';
import { reportError } from '../sentry';
import { useGeniFlow } from '../session/GeniContext';
import { BackButton } from '../components/BackButton';
import { pageWindow } from './FsResults';
import { BUSY_TEXT, useGeniGuard } from './geniGuard';
import './geni.css';

// Geni reports millions of matches for a common name; a pager past this helps no one.
const MAX_PAGES = 20;

function genderClass(g?: string): string {
  return g === 'male' ? 'Male' : g === 'female' ? 'Female' : 'Unknown';
}

/**
 * geni-results — people matching the search, FsResults style: a table of cards
 * with name, life events and a Select button. Parents and spouses aren't listed:
 * Geni's search doesn't return them, and one extra call per row would trip the rate
 * limit. They show on the next screen. Geni pages 50 at a time; the extra criteria
 * filter each page here.
 */
export function GeniResults() {
  const token = useGeniGuard();
  const { state, select } = useGeniFlow();
  const navigate = useNavigate();
  const s = state.search;
  const pidRef = s.pid.trim() ? parseGeniId(s.pid) : null;
  const byPid = s.pid.trim() !== '';

  const [page, setPage] = useState(1);
  const [results, setResults] = useState<GeniProfile[] | null>(null);
  const [returned, setReturned] = useState(0);
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  // Paging quickly can overlap requests; only the latest may update the screen.
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const seq = ++latest.current;
    const stale = () => seq !== latest.current;
    setResults(null);
    setError(null);
    setCanRetry(false);
    setNotice('');
    const busy = () => !stale() && setNotice(BUSY_TEXT);
    try {
      if (byPid) {
        if (!pidRef) {
          setError("That isn't a Geni profile ID. IDs look like profile-123. Go back to fix it or search by name.");
          setResults([]);
          return;
        }
        const person = await getProfile(token, pidRef, busy);
        if (stale()) return;
        if (!person) setError(`No Geni profile found with ID ${s.pid.trim()}. Check the ID and try again.`);
        setResults(person ? [person] : []);
        setReturned(person ? 1 : 0);
        setTotal(person ? 1 : 0);
        if (page === 1) track('geni_results', { result_count: person ? 1 : 0, by_id: true });
      } else {
        const found = await searchPeople(token, s, page, busy);
        if (stale()) return;
        setResults(found.profiles);
        setReturned(found.returned);
        setTotal(found.total);
        if (page === 1) track('geni_results', { result_count: found.profiles.length, total: found.total, by_id: false });
      }
    } catch (err) {
      if (stale()) return;
      track('geni_failed', { step: 'search', busy: isExpectedGeniError(err) });
      // Rate limits and an expired sign-in are expected, not bugs.
      if (!isExpectedGeniError(err)) reportError(err, { screen: 'geni-results', step: 'search' });
      setError(describeGeniError(err));
      setCanRetry(true);
      setResults([]);
    } finally {
      if (!stale()) setNotice('');
    }
  }, [token, byPid, pidRef, s, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function choose(person: GeniProfile): void {
    select(person);
    navigate('/geni-attach');
  }

  if (!token) return null;

  const people = results ?? [];
  const searchTerm = (s.surname || s.givenName || 'person').trim();
  const pageCount = Math.max(1, Math.min(Math.ceil((total || people.length) / GENI_PAGE_SIZE), MAX_PAGES));
  const win = pageWindow(page, pageCount);
  const winFirst = win[0] ?? 1;
  const winLast = win[win.length - 1] ?? pageCount;
  const rangeStart = (page - 1) * GENI_PAGE_SIZE + 1;
  const rangeEnd = (page - 1) * GENI_PAGE_SIZE + returned;
  const filtered = !byPid && hasClientFilters(s);

  return (
    <main>
      <h3>
        Are any of these people the <strong>{searchTerm}</strong> you&apos;re looking for?
      </h3>
      {error && <p role="alert">{error}</p>}
      {error && canRetry && (
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      )}
      {results === null && <p role="status">{notice || 'Searching Geni…'}</p>}
      {results !== null && people.length === 0 && !error && (
        <p>
          {returned > 0
            ? `Geni found ${returned} ${returned === 1 ? 'person' : 'people'} with that name on this page, but none match your gender, years or places. Go back to loosen them${pageCount > 1 ? ', or try the next page' : ''}.`
            : 'No results found.'}
        </p>
      )}

      {!byPid && results !== null && returned > 0 && total > 0 && (
        <div className="results-meta">
          {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} results
          {filtered ? ` · showing ${people.length} that match your details` : ''}
        </div>
      )}

      {people.length > 0 && (
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
              <tr key={person.id}>
                <td className="select-cell">
                  <button type="button" className="btn-success" onClick={() => choose(person)}>
                    Select
                  </button>
                </td>
                <td className="person">
                  {person.thumb && <img className="geni-thumb" src={person.thumb} alt="" loading="lazy" />}
                  <span className={`gender gender-${genderClass(person.gender)}`} aria-hidden="true" />
                  {person.url ? (
                    <a href={person.url} target="_blank" rel="noreferrer">
                      {person.name}
                    </a>
                  ) : (
                    person.name
                  )}
                  <div className="pid">{person.id}</div>
                </td>
                <td className="events" data-label="Events">
                  {person.birthYear || person.birthPlace ? (
                    <div>
                      <strong>b.</strong> {person.birthYear} {person.birthPlace}
                    </div>
                  ) : null}
                  {person.deathYear || person.deathPlace ? (
                    <div>
                      <strong>d.</strong> {person.deathYear} {person.deathPlace}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!byPid && results !== null && pageCount > 1 && (
        <nav className="pagination" aria-label="Search result pages">
          <button type="button" onClick={() => setPage(1)} disabled={page === 1}>
            First
          </button>
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </button>
          {winFirst > 1 && <span className="ellipsis">…</span>}
          {win.map((p) => (
            <button
              key={p}
              type="button"
              className={p === page ? 'is-current' : undefined}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          {winLast < pageCount && <span className="ellipsis">…</span>}
          <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
            Next
          </button>
        </nav>
      )}

      <div className="form-footer">
        <BackButton onClick={() => navigate('/geni-search')}>Modify Search</BackButton>
      </div>
    </main>
  );
}
