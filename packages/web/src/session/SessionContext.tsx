import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';

/** The genealogy search criteria collected on fs-search. */
export interface SearchCriteria {
  givenName: string;
  surname: string;
  gender: string;
  eventType: string;
  eventDateFrom: string;
  eventDateTo: string;
  eventPlace: string;
  spouseGivenName: string;
  spouseSurname: string;
  motherGivenName: string;
  motherSurname: string;
  fatherGivenName: string;
  fatherSurname: string;
  pid: string;
  advanced: boolean;
}

/** The selected FamilySearch person the source will be attached to. */
export interface AttachTarget {
  pid: string;
  name: string;
  url: string;
  justification: string;
  /** Chosen couple-relationship id for a Marriage tag (set via the spouse picker). */
  coupleId?: string;
  /** Display name of the chosen spouse, for the completion summary. */
  spouseName?: string;
}

// `marriage` is in the union (so it has a slot in `tags`) but intentionally NOT
// in EVENT_TAGS: it's a couple fact, not a person vital, so it must stay out of
// the shared person-tag checkboxes, the tag count, and the person source ref.
// It gets its own dev-gated control on the attach screen.
export type EventTag = 'name' | 'gender' | 'birth' | 'christening' | 'death' | 'burial' | 'marriage';
export const EVENT_TAGS: readonly EventTag[] = ['name', 'gender', 'birth', 'christening', 'death', 'burial'];

/** The source the wizard will write to FamilySearch (finalized on fs-source). */
export interface SourceDraft {
  url: string;
  title: string;
  citation: string;
  notes: string;
}

/** Vitals for a brand-new person (Standard name template). */
export interface NewPersonDraft {
  givenName: string;
  surname: string;
  gender: string;
  living: boolean;
  birthDate: string;
  birthPlace: string;
  deathDate: string;
  deathPlace: string;
}

/** Discriminator for the terminal fs-complete screen. */
export type CompleteState = 'noAttachment' | AttachTarget | null;

export interface SessionState {
  search: SearchCriteria;
  attach: AttachTarget | null;
  tags: Record<EventTag, boolean>;
  complete: CompleteState;
  draft: SourceDraft | null;
  /** Set once the source description is created, so re-attach reuses it. */
  createdSourceId: string | null;
  /** Set on the new-person branch (fs-addperson). */
  newPerson: NewPersonDraft | null;
}

export function emptySearch(): SearchCriteria {
  return {
    givenName: '',
    surname: '',
    gender: '',
    eventType: '',
    eventDateFrom: '',
    eventDateTo: '',
    eventPlace: '',
    spouseGivenName: '',
    spouseSurname: '',
    motherGivenName: '',
    motherSurname: '',
    fatherGivenName: '',
    fatherSurname: '',
    pid: '',
    advanced: false,
  };
}

function emptyTags(): Record<EventTag, boolean> {
  return { name: false, gender: false, birth: false, christening: false, death: false, burial: false, marriage: false };
}

export function emptyNewPerson(): NewPersonDraft {
  return { givenName: '', surname: '', gender: 'Unknown', living: false, birthDate: '', birthPlace: '', deathDate: '', deathPlace: '' };
}

function initialState(): SessionState {
  return {
    search: emptySearch(),
    attach: null,
    tags: emptyTags(),
    complete: null,
    draft: null,
    createdSourceId: null,
    newPerson: null,
  };
}

/** True when no actual search criterion is set (the `advanced` UI flag is ignored). */
export function isSearchEmpty(search: SearchCriteria): boolean {
  const blank = emptySearch();
  return (Object.keys(blank) as Array<keyof SearchCriteria>).every(
    (key) => key === 'advanced' || search[key] === blank[key],
  );
}

type Action =
  | { type: 'updateSearch'; patch: Partial<SearchCriteria> }
  | { type: 'resetSearch' }
  | { type: 'selectPerson'; attach: AttachTarget }
  | { type: 'clearAttach' }
  | { type: 'setJustification'; value: string }
  | { type: 'setCouple'; coupleId: string | null; spouseName?: string }
  | { type: 'toggleTag'; tag: EventTag }
  | { type: 'setComplete'; value: CompleteState }
  | { type: 'setDraft'; draft: SourceDraft }
  | { type: 'setCreatedSourceId'; id: string | null }
  | { type: 'setNewPerson'; patch: Partial<NewPersonDraft> }
  | { type: 'clearNewPerson' };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'setNewPerson':
      return { ...state, newPerson: { ...(state.newPerson ?? emptyNewPerson()), ...action.patch } };
    case 'clearNewPerson':
      return { ...state, newPerson: null };
    case 'setDraft':
      return { ...state, draft: action.draft };
    case 'setCreatedSourceId':
      return { ...state, createdSourceId: action.id };
    case 'updateSearch':
      return { ...state, search: { ...state.search, ...action.patch } };
    case 'resetSearch':
      return { ...state, search: emptySearch() };
    case 'selectPerson':
      // Marriage is tied to a specific couple, so it must not carry over from a
      // previously tagged person: reset it whenever the attach target changes.
      // (The other event tags describe the source itself and stay sticky.)
      return { ...state, attach: action.attach, tags: { ...state.tags, marriage: false } };
    case 'clearAttach':
      return { ...state, attach: null };
    case 'setJustification':
      return { ...state, attach: state.attach ? { ...state.attach, justification: action.value } : state.attach };
    case 'setCouple':
      return {
        ...state,
        attach: state.attach
          ? { ...state.attach, coupleId: action.coupleId ?? undefined, spouseName: action.spouseName }
          : state.attach,
      };
    case 'toggleTag':
      return { ...state, tags: { ...state.tags, [action.tag]: !state.tags[action.tag] } };
    case 'setComplete':
      return { ...state, complete: action.value };
    default:
      return state;
  }
}

export interface SessionApi {
  state: SessionState;
  tagCount: number;
  updateSearch(patch: Partial<SearchCriteria>): void;
  resetSearch(): void;
  selectPerson(attach: AttachTarget): void;
  clearAttach(): void;
  setJustification(value: string): void;
  setCouple(coupleId: string | null, spouseName?: string): void;
  toggleTag(tag: EventTag): void;
  setComplete(value: CompleteState): void;
  setDraft(draft: SourceDraft): void;
  setCreatedSourceId(id: string | null): void;
  setNewPerson(patch: Partial<NewPersonDraft>): void;
  clearNewPerson(): void;
}

const SessionContext = createContext<SessionApi | null>(null);

// The wizard state lives in sessionStorage (same lifecycle as the FS token:
// survives a reload, clears when the tab closes). Without this, a page reload
// mid-flow wipes the search criteria and the next FamilySearch search fires with
// an empty query — which FamilySearch rejects with a 400.
const SESSION_KEY = 'rs_session';

function restoreSession(): Partial<SessionState> | undefined {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Partial<SessionState>) : undefined;
  } catch {
    return undefined;
  }
}

function persistSession(state: SessionState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable */
  }
}

export function SessionProvider({ children, initial }: { children: ReactNode; initial?: Partial<SessionState> }) {
  // Precedence: base defaults < restored-from-reload < explicit `initial` (tests).
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...initialState(),
    ...restoreSession(),
    ...initial,
  }));

  useEffect(() => {
    persistSession(state);
  }, [state]);

  const api = useMemo<SessionApi>(
    () => ({
      state,
      tagCount: EVENT_TAGS.filter((tag) => state.tags[tag]).length,
      updateSearch: (patch) => dispatch({ type: 'updateSearch', patch }),
      resetSearch: () => dispatch({ type: 'resetSearch' }),
      selectPerson: (attach) => dispatch({ type: 'selectPerson', attach }),
      clearAttach: () => dispatch({ type: 'clearAttach' }),
      setJustification: (value) => dispatch({ type: 'setJustification', value }),
      setCouple: (coupleId, spouseName) => dispatch({ type: 'setCouple', coupleId, spouseName }),
      toggleTag: (tag) => dispatch({ type: 'toggleTag', tag }),
      setComplete: (value) => dispatch({ type: 'setComplete', value }),
      setDraft: (draft) => dispatch({ type: 'setDraft', draft }),
      setCreatedSourceId: (id) => dispatch({ type: 'setCreatedSourceId', id }),
      setNewPerson: (patch) => dispatch({ type: 'setNewPerson', patch }),
      clearNewPerson: () => dispatch({ type: 'clearNewPerson' }),
    }),
    [state],
  );
  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
