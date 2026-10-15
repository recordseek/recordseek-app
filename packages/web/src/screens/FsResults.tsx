import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { parseSearchResults, parseSearchTotal, parsePerson, type PersonResult } from '@recordseek/core';
import { useSession, type SearchCriteria } from '../session/SessionContext';
import { createFsClient } from '../auth/fsClient';
import { beginFsLogin, isFsAuthError } from '../fsAuth';
import { BackButton } from '../components/BackButton';
import { reportError } from '../sentry';
import { track } from '../analytics';

const PAGE_SIZE = 20;
// FamilySearch rejects very deep offsets and a 200-page pager helps no one, so we
// cap how far the numbered pages go (the legacy app capped at 26 pages).
const MAX_PAGES = 50;

/**
 * The sliding window of (1-based) page numbers to show around the current page,
 * up to `size` of them — e.g. current=8 of 196 → [6,7,8,9,10].
 */
export function pageWindow(current: number, pageCount: number, size = 5): number[] {
  if (pageCount <= 0) return [];
  const half = Math.floor(size / 2);
  let start = Math.max(1, current - half);
  const end = Math.min(pageCount, start + size - 1);
  start = Math.max(1, end - size + 1);
  const out: number[] = [];
  for (let p = start; p <= end; p++) out.push(p);
  return out;
}

export interface FsResultsClient {
  searchPersons(query: Record<string, string>, options?: { count?: number; offset?: number }): Promise<unknown>;
  getPerson(personId: string): Promise<unknown>;
}

/**
 * Map the session search criteria to FamilySearch `q.<field>` query keys (legacy
 * parity): names and the place get a `~` suffix for a fuzzy match, and the year
 * range goes out as `<event>Date.from` / `.to` with a `+` year prefix.
 */
export function buildSearchQuery(s: SearchCriteria): Record<string, string> {
  const q: Record<string, string> = {};
  const fuzzy = (key: string, value: string): void => {
    if (value.trim()) q[key] = `${value.trim()}~`;
  };
  fuzzy('givenName', s.givenName);
  fuzzy('surname', s.surname);
  if (s.gender) q.gender = s.gender;
  fuzzy('spouseGivenName', s.spouseGivenName);
  fuzzy('spouseSurname', s.spouseSurname);
  fuzzy('motherGivenName', s.motherGivenName);
  fuzzy('motherSurname', s.motherSurname);
  fuzzy('fatherGivenName', s.fatherGivenName);
  fuzzy('fatherSurname', s.fatherSurname);
  if (s.eventType) {
    if (s.eventDateFrom.trim()) q[`${s.eventType}Date.from`] = `+${s.eventDateFrom.trim()}`;
    if (s.eventDateTo.trim()) q[`${s.eventType}Date.to`] = `+${s.eventDateTo.trim()}`;
    fuzzy(`${s.eventType}Place`, s.eventPlace);
  }
  return q;
}

/** True when the criteria produce at least one FamilySearch query term (an event type alone does not). */
export function hasSearchCriteria(s: SearchCriteria): boolean {
  return Object.keys(buildSearchQuery(s)).length > 0;
}

export function FsResults({ client: providedClient }: { client?: FsResultsClient }) {
  const { state, selectPerson, clearAttach, setComplete } = useSession();
  const navigate = useNavigate();
  const client = useMemo<FsResultsClient>(() => providedClient ?? createFsClient(), [providedClient]);

  const pid = state.search.pid.trim();
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<PersonResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setResults(null);
    setError(null);
    // Nothing to search (e.g. a reload that lost the criteria, or a direct hit on
    // this URL): bounce to the form instead of firing an empty query that 400s.
    if (!pid && !hasSearchCriteria(state.search)) {
      navigate('/fs-search', { replace: true });
      return;
    }
    try {
      if (pid) {
        let doc: unknown;
        try {
          doc = await client.getPerson(pid);
        } catch (err) {
          // A mistyped, merged or deleted ID is the user's to fix, not a bug.
          const status = (err as { status?: unknown } | null)?.status;
          if (status === 404 || status === 410) {
            setError(`No Family Tree person found with ID ${pid}. Check the ID and try again.`);
            setResults([]);
            return;
          }
          throw err;
        }
        const person = parsePerson(doc, pid);
        setResults(person ? [person] : []);
        track('fs_search_run', { result_count: person ? 1 : 0 });
        setTotal(person ? 1 : 0);
      } else {
        const feed = await client.searchPersons(buildSearchQuery(state.search), {
          count: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        });
        const found = parseSearchResults(feed);
        setResults(found);
        setTotal(parseSearchTotal(feed));
        if (page === 0) {
          track('fs_search_run', { result_count: found.length });
        }
      }
    } catch (err) {
      // A dead FamilySearch session re-authenticates transparently and returns
      // here (the persisted search re-runs). Real API errors surface as before.
      if (isFsAuthError(err)) {
        void beginFsLogin('/fs-results');
        return;
      }
      reportError(err, { screen: 'fs-results' });
      track('fs_action_failed', { step: 'search' });
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    }
  }, [client, pid, page, state.search, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  function select(person: PersonResult): void {
    selectPerson({ pid: person.pid, name: person.name, url: person.url, justification: '' });
    navigate('/fs-attach');
  }

  function saveWithoutAttaching(): void {
    clearAttach();
    setComplete('noAttachment');
    navigate('/fs-create');
  }

  const searchTerm = (state.search.surname || state.search.givenName || 'person').trim();
  const people = results ?? [];

  // Numbered pagination, driven by the feed's reported total (only in search mode).
  const pageCount = Math.max(1, Math.min(Math.ceil((total || people.length) / PAGE_SIZE), MAX_PAGES));
  const current1 = page + 1;
  const win = pageWindow(current1, pageCount);
  const winFirst = win[0] ?? 1;
  const winLast = win[win.length - 1] ?? pageCount;
  const rangeStart = page * PAGE_SIZE + 1;
  const rangeEnd = page * PAGE_SIZE + people.length;

  return (
    <main>
      <h3>
        Are any of these people the <strong>{searchTerm}</strong> you&apos;re looking for?
      </h3>
      {error && <p role="alert">{error}</p>}
      {results === null && <p role="status">Searching FamilySearch…</p>}
      {results !== null && people.length === 0 && !error && <p>No results found.</p>}

      {!pid && people.length > 0 && total > 0 && (
        <div className="results-meta">
          {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {total.toLocaleString()} results
        </div>
      )}

      {people.length > 0 && (
        <table className="results-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Person</th>
              <th>Events</th>
              <th>Parents</th>
              <th>Spouse(s)</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const hasEvents = Boolean(person.birthDate || person.deathDate);
              return (
                <tr key={person.pid}>
                  <td className="select-cell">
                    <button type="button" className="btn-success" onClick={() => select(person)}>
                      Select
                    </button>
                  </td>
                  <td className="person">
                    <span className={`gender gender-${person.gender}`} aria-hidden="true" />
                    <a href={person.url} target="_blank" rel="noreferrer">
                      {person.name || '(unnamed)'}
                    </a>
                    <div className="pid">{person.pid}</div>
                  </td>
                  <td className="events" data-label="Events">
                    {hasEvents ? (
                      <>
                        {person.birthDate && (
                          <div>
                            <strong>b.</strong> {person.birthDate} {person.birthPlace}
                          </div>
                        )}
                        {person.deathDate && (
                          <div>
                            <strong>d.</strong> {person.deathDate} {person.deathPlace}
                          </div>
                        )}
                      </>
                    ) : person.lifespan ? (
                      <div>{person.lifespan}</div>
                    ) : null}
                  </td>
                  <td className="relatives parents" data-label="Parents">
                    {person.fathers.map((relative) => (
                      <div className="relative" key={relative.pid}>
                        <span className="role-icon role-father" title="Father" aria-hidden="true">
                          ♂
                        </span>
                        <a href={relative.url} target="_blank" rel="noreferrer">
                          {relative.name}
                        </a>
                      </div>
                    ))}
                    {person.mothers.map((relative) => (
                      <div className="relative" key={relative.pid}>
                        <span className="role-icon role-mother" title="Mother" aria-hidden="true">
                          ♀
                        </span>
                        <a href={relative.url} target="_blank" rel="noreferrer">
                          {relative.name}
                        </a>
                      </div>
                    ))}
                  </td>
                  <td className="relatives spouses" data-label="Spouse(s)">
                    {person.spouses.map((spouse) => (
                      <div className="relative" key={spouse.pid}>
                        <span className="role-icon role-spouse" title="Spouse" aria-hidden="true">
                          ⚭
                        </span>
                        <a href={spouse.url} target="_blank" rel="noreferrer">
                          {spouse.name}
                        </a>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!pid && people.length > 0 && pageCount > 1 && (
        <nav className="pagination" aria-label="Search result pages">
          <button type="button" onClick={() => setPage(0)} disabled={page === 0}>
            First
          </button>
          <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            Previous
          </button>
          {winFirst > 1 && <span className="ellipsis">…</span>}
          {win.map((p) => (
            <button
              key={p}
              type="button"
              className={p === current1 ? 'is-current' : undefined}
              aria-current={p === current1 ? 'page' : undefined}
              onClick={() => setPage(p - 1)}
            >
              {p}
            </button>
          ))}
          {winLast < pageCount && <span className="ellipsis">…</span>}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={current1 >= pageCount}
          >
            Next
          </button>
          <button type="button" onClick={() => setPage(pageCount - 1)} disabled={current1 >= pageCount}>
            Last
          </button>
        </nav>
      )}

      <div className="form-footer">
        <BackButton onClick={() => navigate('/fs-search')}>Modify Search</BackButton>
        <div className="footer-right">
          <button type="button" className="link-button" onClick={() => navigate('/fs-addperson')}>
            Person not found? Add one
          </button>
          <button type="button" onClick={saveWithoutAttaching}>
            Save Now, Attach Later
          </button>
        </div>
      </div>
    </main>
  );
}
