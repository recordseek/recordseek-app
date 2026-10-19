import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAncestry2Flow } from '../ancestry2/flow';
import { track } from '../analytics';
import { SavedActions } from '../components/SavedActions';

/** ancestry2-complete — terminal confirmation; Go Back returns to the source form with the edits kept. */
export function Ancestry2Complete() {
  const navigate = useNavigate();
  const [flow, update] = useAncestry2Flow();
  const saved = flow.saved;

  useEffect(() => {
    if (saved) track('ancestry2_completed');
    else navigate('/ancestry2', { replace: true });
  }, [saved, navigate]);

  if (!saved) return null;
  return (
    <SavedActions
      heading={`Saved to Ancestry on ${saved.personName}.`}
      title={flow.source?.title}
      links={[{ href: saved.personUrl, label: `View ${saved.personName} on Ancestry` }]}
      newsletterSource="ancestry2"
      onEdit={() => {
        update({ saved: null, selected: null });
        navigate('/ancestry2');
      }}
    >
      <p className="field-hint">Find it on the person’s Facts page under Sources.</p>
    </SavedActions>
  );
}
