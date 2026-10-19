import { useEffect, useState } from 'react';
import type { SourceFieldValues } from '../components/SourceFields';
import type { Ancestry2Person, Ancestry2Status } from './browser-transport.mjs';

const KEY = 'rs_ancestry2_flow';

/** What the Ancestry2 wizard carries between its screens (sessionStorage, so a reload keeps your place). */
export interface Ancestry2FlowState {
  /** The signed-in account and its trees, from the companion. */
  account: Required<Pick<Ancestry2Status, 'userId' | 'trees' | 'recentTreeId'>> | null;
  source: SourceFieldValues | null;
  treeId: string;
  givenName: string;
  surname: string;
  selected: Ancestry2Person | null;
  /** The save in flight or last finished; never replayed automatically. */
  jobId: string | null;
  saved: { personName: string; personUrl: string } | null;
}

function empty(): Ancestry2FlowState {
  return {
    account: null,
    source: null,
    treeId: '',
    givenName: '',
    surname: '',
    selected: null,
    jobId: null,
    saved: null,
  };
}

export function loadAncestry2Flow(): Ancestry2FlowState {
  try {
    return { ...empty(), ...(JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<Ancestry2FlowState> | null) };
  } catch {
    return empty();
  }
}

/** Write through immediately, so a save's job id is stored before the request goes out. */
export function storeAncestry2Flow(state: Ancestry2FlowState): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function useAncestry2Flow(): [Ancestry2FlowState, (patch: Partial<Ancestry2FlowState>) => Ancestry2FlowState] {
  const [state, setState] = useState(loadAncestry2Flow);
  useEffect(() => {
    storeAncestry2Flow(state);
  }, [state]);
  function update(patch: Partial<Ancestry2FlowState>): Ancestry2FlowState {
    const next = { ...loadAncestry2Flow(), ...patch };
    storeAncestry2Flow(next);
    setState(next);
    return next;
  }
  return [state, update];
}

export function ancestryPersonUrl(treeId: string, personId: string): string {
  return `https://www.ancestry.com/family-tree/person/tree/${encodeURIComponent(treeId)}/person/${encodeURIComponent(personId)}/facts`;
}
