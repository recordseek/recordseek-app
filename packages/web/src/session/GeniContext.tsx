import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emptyCriteria, type GeniCriteria, type GeniDocument, type GeniProfile } from '../geni';
import type { SourceFieldValues } from '../components/SourceFields';

const KEY = 'rs_geni_flow';

/** What the Geni wizard carries between its screens (kept in sessionStorage so a reload keeps your place). */
export interface GeniFlowState {
  /** The edited source, once the user pressed Next on /geni. */
  source: SourceFieldValues | null;
  search: GeniCriteria;
  /** The person the source goes to. */
  selected: GeniProfile | null;
  /** Result of the last save, shown on /geni-complete. */
  saved: { doc: GeniDocument; people: GeniProfile[] } | null;
}

function empty(): GeniFlowState {
  return { source: null, search: emptyCriteria(), selected: null, saved: null };
}

function load(): GeniFlowState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<GeniFlowState> | null;
    return parsed ? { ...empty(), ...parsed, search: { ...emptyCriteria(), ...parsed.search } } : empty();
  } catch {
    return empty();
  }
}

interface GeniFlow {
  state: GeniFlowState;
  setSource: (source: SourceFieldValues) => void;
  updateSearch: (patch: Partial<GeniCriteria>) => void;
  resetSearch: () => void;
  select: (person: GeniProfile | null) => void;
  setSaved: (saved: GeniFlowState['saved']) => void;
  /** Forget the person and result, keeping the source (for "save to another person"). */
  clearPerson: () => void;
  clearAll: () => void;
}

const Ctx = createContext<GeniFlow | null>(null);

export function GeniFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GeniFlowState>(load);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state]);

  const value = useMemo<GeniFlow>(
    () => ({
      state,
      setSource: (source) => setState((s) => ({ ...s, source })),
      updateSearch: (patch) => setState((s) => ({ ...s, search: { ...s.search, ...patch } })),
      resetSearch: () => setState((s) => ({ ...s, search: emptyCriteria() })),
      select: (selected) => setState((s) => ({ ...s, selected })),
      setSaved: (saved) => setState((s) => ({ ...s, saved })),
      clearPerson: () => setState((s) => ({ ...s, selected: null, saved: null, search: emptyCriteria() })),
      clearAll: () => setState(empty()),
    }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGeniFlow(): GeniFlow {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGeniFlow must be used inside GeniFlowProvider');
  return ctx;
}
