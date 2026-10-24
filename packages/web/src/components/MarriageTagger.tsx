import { useCallback, useEffect, useState } from 'react';
import type { Spouse } from '@recordseek/core';
import { useSession } from '../session/SessionContext';
import { createFsClient } from '../auth/fsClient';

/** Just the slice of the FS client this component needs (so tests can mock it). */
export interface SpouseSource {
  getPersonSpouses(personId: string): Promise<Spouse[]>;
}

type Status = 'idle' | 'loading' | 'none' | 'error' | 'ready';

/**
 * Dev-gated "Marriage" tag for the attach screen. Marriage is a couple fact, so
 * the source attaches to a couple relationship, not the person — which means we
 * must know the spouse. Checking the box looks up the person's spouses: none →
 * a notice (can't tag); one → used automatically; several → a picker. The choice
 * is stored on the attach target as `coupleId`, which fs-create reads.
 */
export function MarriageTagger({ pid, client }: { pid: string; client?: SpouseSource }) {
  const { state, toggleTag, setCouple } = useSession();
  const checked = state.tags.marriage;
  const coupleId = state.attach?.coupleId;
  const [spouses, setSpouses] = useState<Spouse[] | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  const load = useCallback(
    async (turningOn: boolean): Promise<void> => {
      setStatus('loading');
      try {
        const fs = client ?? createFsClient();
        const list = await fs.getPersonSpouses(pid);
        if (list.length === 0) {
          setSpouses([]);
          setStatus('none');
          if (checked) {
            toggleTag('marriage');
            setCouple(null);
          }
          return;
        }
        setSpouses(list);
        setStatus('ready');
        if (turningOn) toggleTag('marriage');
        // One spouse: use it. Several: require a pick (leave coupleId unset).
        const only = list.length === 1 ? list[0] : undefined;
        if (only) setCouple(only.coupleId, only.spouseName);
      } catch {
        setStatus('error');
      }
    },
    [client, pid, checked, toggleTag, setCouple],
  );

  // Re-hydrate the picker if the box is already checked on mount (e.g. the user
  // navigated back here) and we haven't loaded the spouse list yet.
  useEffect(() => {
    if (checked && spouses === null && status === 'idle') void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onToggle(): void {
    if (checked) {
      toggleTag('marriage');
      setCouple(null);
      setSpouses(null);
      setStatus('idle');
      return;
    }
    void load(true);
  }

  return (
    <div className="marriage-tagger">
      <label className="marriage-checkbox">
        <input type="checkbox" checked={checked} onChange={onToggle} disabled={status === 'loading'} />
        Marriage
      </label>
      {status === 'loading' && <p className="marriage-note">Looking up spouses on FamilySearch…</p>}
      {status === 'none' && (
        <p className="marriage-note">No spouse on FamilySearch to tag. Add the marriage on FamilySearch first.</p>
      )}
      {status === 'error' && <p className="marriage-note">Couldn’t load spouses from FamilySearch. Try again.</p>}
      {checked && spouses && spouses.length > 1 && (
        <fieldset className="spouse-picker">
          <legend>Tag the marriage to which spouse?</legend>
          {spouses.map((s) => (
            <label key={s.coupleId} className="spouse-option">
              <input
                type="radio"
                name="rs-spouse"
                checked={coupleId === s.coupleId}
                onChange={() => setCouple(s.coupleId, s.spouseName)}
              />
              {s.spouseName || 'Unknown spouse'}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
