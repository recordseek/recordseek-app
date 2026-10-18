import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import {
  addDocument,
  describeGeniError,
  immediateFamily,
  isExpectedGeniError,
  type GeniFamily,
  type GeniProfile,
} from '../geni';
import { reportError } from '../sentry';
import { useGeniFlow } from '../session/GeniContext';
import { BackButton } from '../components/BackButton';
import { ForwardButton } from '../components/ForwardButton';
import { useGeniGuard } from './geniGuard';
import { Loading } from './Loading';

const GROUPS: { key: keyof GeniFamily; title: string }[] = [
  { key: 'parents', title: 'Parents' },
  { key: 'spouses', title: 'Spouse(s)' },
  { key: 'siblings', title: 'Siblings' },
  { key: 'children', title: 'Children' },
];

/** The text Geni stores on the document: citation, notes, then the page link. */
export function documentText(source: { citation: string; notes: string; url: string }): string {
  return [source.citation, source.notes, source.url].filter((t) => t.trim()).join('\n\n');
}

/**
 * geni-attach — confirm the person and the source, optionally tag relatives from
 * the person's immediate family too, then save. Saving creates one Geni document
 * and tags each chosen profile in it, one call at a time (Geni rate limit).
 */
export function GeniAttach() {
  const token = useGeniGuard();
  const { state, setSaved } = useGeniFlow();
  const navigate = useNavigate();
  const person = state.selected;
  const source = state.source;
  const [family, setFamily] = useState<GeniFamily | null>(null);
  const [familyNote, setFamilyNote] = useState('');
  const [extra, setExtra] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (token && !person) navigate('/geni-search', { replace: true });
  }, [token, person, navigate]);

  // One read for the family; a failure only costs the checkboxes.
  useEffect(() => {
    if (!token || !person) return;
    let active = true;
    immediateFamily(token, person.id)
      .then((f) => {
        if (!active) return;
        setFamily(f);
        setFamilyNote('');
      })
      .catch(() => active && setFamilyNote('Couldn’t load their family from Geni. You can still save to this person.'));
    return () => {
      active = false;
    };
  }, [token, person]);

  if (!token || !person || !source) return null;

  const relatives: GeniProfile[] = family ? GROUPS.flatMap((g) => family[g.key]) : [];
  const chosen = relatives.filter((r) => extra[r.id]);

  async function save(): Promise<void> {
    if (!token || !person || !source || busy) return;
    const people = [person, ...chosen];
    track('geni_attached', { people: people.length });
    setBusy(true);
    setError('');
    try {
      const doc = await addDocument(
        {
          token,
          title: source.title.trim() || source.url,
          text: documentText(source),
          sourceUrl: source.url,
          profileIds: people.map((p) => p.id),
        },
      );
      track('geni_saved', { tagged: doc.tagged, people: doc.taggedIds.length });
      setSaved({ doc, people });
      navigate('/geni-complete');
    } catch (err) {
      track('geni_failed', { step: 'save', busy: isExpectedGeniError(err) });
      if (!isExpectedGeniError(err)) reportError(err, { screen: 'geni-attach', step: 'save' });
      setError(describeGeniError(err));
    } finally {
      setBusy(false);
    }
  }

  if (busy) return <Loading status="Saving to Geni…" />;
  if (!family && !familyNote) return <Loading status="Loading their family from Geni…" />;

  return (
    <main>
      <div className="attach-header">
        <h3 className="attach-title">
          Attach Document to{' '}
          {person.url ? (
            <a href={person.url} target="_blank" rel="noreferrer">
              {person.name}
            </a>
          ) : (
            person.name
          )}
        </h3>
      </div>
      {person.years && <p className="field-hint">{person.years}</p>}
      <p>Source: &quot;{source.title}&quot;</p>

      {familyNote && (
        <p className="field-hint" role="status">
          {familyNote}
        </p>
      )}
      {relatives.length > 0 && (
        <div className="geni-family">
          <strong>Also tag family in this document (optional)</strong>
          {GROUPS.map(({ key, title }) =>
            family && family[key].length > 0 ? (
              <div key={key}>
                <h4>{title}</h4>
                <ul>
                  {family[key].map((r) => (
                    <li key={r.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(extra[r.id])}
                          disabled={busy}
                          onChange={(e) => setExtra((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                        />
                        {r.name}
                        {r.years ? ` (${r.years})` : ''}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      )}

      <p className="field-hint">Geni sets who can see new documents; check the document’s privacy on Geni.</p>
      {error && <p role="alert">{error}</p>}

      <div className="form-footer">
        <BackButton onClick={() => navigate('/geni-results')} />
        <div className="footer-right">
          <ForwardButton onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : chosen.length ? `Save & Tag ${chosen.length + 1} People` : 'Save Document'}
          </ForwardButton>
        </div>
      </div>
    </main>
  );
}
