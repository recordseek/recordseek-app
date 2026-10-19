import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import {
  canSearch,
  hasClientFilters,
  isValidGeniId,
  myFamily,
  setGeniId,
  setGeniName,
  normalizeGeniId,
  type GeniProfile,
} from '../geni';
import { useGeniFlow } from '../session/GeniContext';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';
import { useGeniGuard } from './geniGuard';
import { Loading } from './Loading';

interface QuickPick {
  label: string;
  person: GeniProfile;
}

/**
 * geni-search — find the person to attach to. Geni's search takes only a name, so
 * birth, death and gender narrow the results afterwards (geni-results). A profile
 * ID, guid or geni.com link goes straight to that person. "Me" and the signed-in
 * user's immediate family are one-click picks.
 */
export function GeniSearch() {
  const token = useGeniGuard();
  const { state, updateSearch, resetSearch, select } = useGeniFlow();
  const navigate = useNavigate();
  const s = state.search;
  const [quick, setQuick] = useState<QuickPick[]>([]);
  const [quickNote, setQuickNote] = useState('');
  const [quickLoading, setQuickLoading] = useState(true);

  // "Me" and my immediate family come from a single Geni call (immediate-family carries both).
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const { me, family } = await myFamily(token);
        if (!active) return;
        if (me?.name) setGeniName(me.name);
        if (me?.id) setGeniId(me.id);
        setQuick([
          ...(me ? [{ label: 'Me', person: me }] : []),
          ...family.parents.map((person) => ({ label: 'Parent', person })),
          ...family.spouses.map((person) => ({ label: 'Spouse', person })),
          ...family.siblings.map((person) => ({ label: 'Sibling', person })),
          ...family.children.map((person) => ({ label: 'Child', person })),
        ]);
        setQuickNote('');
        setQuickLoading(false);
      } catch {
        // Quick picks are a convenience; searching still works.
        if (active) {
          setQuickNote('Couldn’t load your family from Geni right now. You can still search.');
          setQuickLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const byPid = s.pid.trim() !== '';
  const pidInvalid = byPid && !isValidGeniId(s.pid);
  const canSubmit = byPid ? !pidInvalid : canSearch(s);
  const onlyFilters = !byPid && !canSearch(s) && (hasClientFilters(s) || false);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!canSubmit) return;
    track('geni_search', { by_id: byPid, filters: hasClientFilters(s) });
    navigate('/geni-results');
  }

  function pick(person: GeniProfile): void {
    track('geni_quick_pick');
    select(person);
    navigate('/geni-attach');
  }

  if (!token) return null;
  if (quickLoading) return <Loading status="Loading your family from Geni…" />;

  return (
    <main>
      <h1>Search for an existing person</h1>
      {quick.length > 0 && (
        <div className="field">
          <span className="field-label">Quick picks</span>
          <div className="geni-quick">
            {quick.map(({ label, person }) => (
              <button type="button" className="btn-sm" key={person.id} onClick={() => pick(person)}>
                {label === 'Me' ? 'Me' : `${label}: ${person.name}`}
              </button>
            ))}
          </div>
        </div>
      )}
      {quickNote && (
        <p className="field-hint" role="status">
          {quickNote}
        </p>
      )}
      <form onSubmit={submit}>
        <div className="field">
          <label className="field-label" htmlFor="geni-pid">
            Already know their Geni profile? <span className="field-hint">(e.g. profile-123 or a geni.com link)</span>
          </label>
          <input
            id="geni-pid"
            placeholder="Profile ID or link"
            value={s.pid}
            aria-invalid={pidInvalid || undefined}
            aria-describedby={pidInvalid ? 'geni-pid-error' : undefined}
            onChange={(e) => updateSearch({ pid: normalizeGeniId(e.target.value) })}
          />
          {pidInvalid && (
            <span id="geni-pid-error" className="field-hint" role="alert">
              A Geni profile ID looks like profile-123, a long number starting 6000000, or a geni.com/people link. To
              search by name, clear this box.
            </span>
          )}
        </div>

        <p className="field-hint search-or">Or search Geni:</p>
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
            <select value={s.gender} onChange={(e) => updateSearch({ gender: e.target.value as typeof s.gender })}>
              <option value="">Unknown</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <span />
          <label>
            Birth Year
            <input
              inputMode="numeric"
              value={s.birthYear}
              onChange={(e) => updateSearch({ birthYear: e.target.value })}
            />
          </label>
          <label>
            Birth Place
            <input value={s.birthPlace} onChange={(e) => updateSearch({ birthPlace: e.target.value })} />
          </label>
          <label>
            Death Year
            <input
              inputMode="numeric"
              value={s.deathYear}
              onChange={(e) => updateSearch({ deathYear: e.target.value })}
            />
          </label>
          <label>
            Death Place
            <input value={s.deathPlace} onChange={(e) => updateSearch({ deathPlace: e.target.value })} />
          </label>
        </fieldset>
        {!byPid && (
          <p className="field-hint">
            Geni searches by name only. Gender, years (within 2) and places narrow the names Geni returns.
          </p>
        )}

        <div className="form-footer">
          <BackButton onClick={() => navigate('/geni')}>Modify Source</BackButton>
          <div className="footer-right">
            {onlyFilters && (
              <span className="field-hint" role="status">
                Add a name for the person to search.
              </span>
            )}
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
