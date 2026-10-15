import { useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSession, isSearchEmpty } from '../session/SessionContext';
import { useOptionalCapture } from '../capture/CaptureContext';
import { personToSearch } from '../session/prefill';
import { BackButton } from '../components/BackButton';
import { hasSearchCriteria } from './FsResults';
import { ForwardButton } from '../components/ForwardButton';

/** Uppercase, strip to alphanumerics, and dash into groups of four (LZ12-345). */
export function normalizePid(raw: string): string {
  const cleaned = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const groups = cleaned.match(/.{1,4}/g);
  return groups ? groups.join('-') : '';
}

/**
 * fs-search — compact, multi-column person search. Faithful port of the legacy
 * layout (all fields visible in a grid + a PID lookup), minus its bugs: the Next
 * gate is a clean `!isSearchEmpty`, and the PID handler is null-safe.
 */
export function FsSearch() {
  const { state, updateSearch, resetSearch } = useSession();
  const navigate = useNavigate();
  const s = state.search;
  const person = useOptionalCapture()?.person;

  // Pre-fill once from genscrape's person data, only while the search is still
  // untouched (a restored or user-edited search wins). Reset stays blank.
  useEffect(() => {
    if (!person || !isSearchEmpty(state.search)) return;
    // Remember which person was applied, so Reset stays blank for this capture
    // but a new capture in the same tab still pre-fills.
    const key = 'rs_search_prefilled';
    const applied = JSON.stringify(person);
    try {
      if (window.sessionStorage.getItem(key) === applied) return;
      window.sessionStorage.setItem(key, applied);
    } catch {
      /* ignore */
    }
    updateSearch(personToSearch(person));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person]);
  // An event type with no date or place adds no query term, so it can't search alone.
  const canSubmit = s.pid.trim() !== '' || hasSearchCriteria(s);
  const eventChosen = s.eventType !== '';
  // A Person ID goes straight to that person, so the search fields don't apply.
  const byPid = s.pid.trim() !== '';

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (canSubmit) {
      navigate('/fs-results');
    }
  }

  return (
    <main>
      <h1>Search for an existing person</h1>
      <form onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="pid-input">
            Already know their Person ID? <span className="field-hint">(e.g. LZ12-345)</span>
          </label>
          <input
            id="pid-input"
            placeholder="Person ID"
            value={s.pid}
            onChange={(e) => updateSearch({ pid: normalizePid(e.target.value) })}
          />
        </div>

        <p className="field-hint search-or">Or search the Family Tree:</p>
        <fieldset className="form-grid" disabled={byPid}>
          <label>
            Given Name(s)
            <input value={s.givenName} onChange={(e) => updateSearch({ givenName: e.target.value })} />
          </label>
          <label>
            Last Names (Surname)
            <input value={s.surname} onChange={(e) => updateSearch({ surname: e.target.value })} />
          </label>
          <label>
            Gender
            <select value={s.gender} onChange={(e) => updateSearch({ gender: e.target.value })}>
              <option value="">Unknown</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label>
            Event Type
            <select value={s.eventType} onChange={(e) => updateSearch({ eventType: e.target.value })}>
              <option value="">— none —</option>
              <option value="birthLike">Birth</option>
              <option value="marriageLike">Marriage</option>
              <option value="deathLike">Death</option>
              <option value="residence">Residence / Census</option>
            </select>
          </label>

          <label>
            Spouse&apos;s Given Name(s)
            <input value={s.spouseGivenName} onChange={(e) => updateSearch({ spouseGivenName: e.target.value })} />
          </label>
          <label>
            Spouse&apos;s Surname
            <input value={s.spouseSurname} onChange={(e) => updateSearch({ spouseSurname: e.target.value })} />
          </label>
          <label>
            Event Year (Range)
            <div className="year-range">
              <input
                aria-label="Event year from"
                placeholder="From"
                value={s.eventDateFrom}
                disabled={!eventChosen}
                onChange={(e) => updateSearch({ eventDateFrom: e.target.value })}
              />
              <input
                aria-label="Event year to"
                placeholder="To"
                value={s.eventDateTo}
                disabled={!eventChosen}
                onChange={(e) => updateSearch({ eventDateTo: e.target.value })}
              />
            </div>
          </label>
          <label>
            Event Place
            <input
              value={s.eventPlace}
              disabled={!eventChosen}
              onChange={(e) => updateSearch({ eventPlace: e.target.value })}
            />
          </label>

          <label>
            Mother&apos;s Given Name(s)
            <input value={s.motherGivenName} onChange={(e) => updateSearch({ motherGivenName: e.target.value })} />
          </label>
          <label>
            Mother&apos;s Surname
            <input value={s.motherSurname} onChange={(e) => updateSearch({ motherSurname: e.target.value })} />
          </label>
          <label>
            Father&apos;s Given Name(s)
            <input value={s.fatherGivenName} onChange={(e) => updateSearch({ fatherGivenName: e.target.value })} />
          </label>
          <label>
            Father&apos;s Surname
            <input value={s.fatherSurname} onChange={(e) => updateSearch({ fatherSurname: e.target.value })} />
          </label>
        </fieldset>

        <div className="form-footer">
          <BackButton onClick={() => navigate('/fs-source')}>Modify Source</BackButton>
          <div className="footer-right">
            <button type="button" className="btn-sm" onClick={() => resetSearch()}>
              Reset
            </button>
            <ForwardButton type="submit" disabled={!canSubmit}>
              Next
            </ForwardButton>
          </div>
        </div>
      </form>
    </main>
  );
}
