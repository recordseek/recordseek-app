import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { track } from '../analytics';
import { useGeniFlow } from '../session/GeniContext';
import { SavedActions, type SavedLink } from '../components/SavedActions';

/**
 * geni-complete — terminal confirmation, via the shared SavedActions panel (View on
 * Geni / Go Back / Save to Another Location). Go Back returns to the source form
 * with the edits kept.
 */
export function GeniComplete() {
  const { state, setSaved, select } = useGeniFlow();
  const navigate = useNavigate();
  const saved = state.saved;

  useEffect(() => {
    if (saved) track('geni_completed');
    else navigate('/geni', { replace: true });
  }, [saved, navigate]);

  if (!saved) return null;
  const { doc, people } = saved;
  const links: SavedLink[] = [{ href: doc.url, label: 'View the document on Geni' }];
  for (const p of people) if (p.url && doc.taggedIds.includes(p.id)) links.push({ href: p.url, label: `View ${p.name} on Geni` });
  const failed = people.filter((p) => doc.failedIds.includes(p.id));

  return (
    <SavedActions
      heading={`Saved to Geni as a document on ${people[0]?.name ?? 'the profile'}.`}
      title={state.source?.title}
      links={links}
      newsletterSource="geni"
      onEdit={() => {
        setSaved(null);
        select(null);
        navigate('/geni');
      }}
    >
      <p className="field-hint">
        Find it on the profile under Media → Documents. Geni doesn’t let apps add to the Sources tab.
      </p>
      {failed.length > 0 && (
        <p>
          The document was added, but Geni wouldn’t tag {failed.map((p) => p.name).join(', ')} in it. You can tag{' '}
          them on Geni.
        </p>
      )}
    </SavedActions>
  );
}
