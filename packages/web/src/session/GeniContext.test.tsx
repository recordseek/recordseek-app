import { describe, it, expect, afterEach } from 'vitest';
import { type ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { GeniFlowProvider, useGeniFlow } from './GeniContext';
import type { SourceFieldValues } from '../components/SourceFields';
import type { GeniProfile, GeniDocument } from '../geni';

const wrapper = ({ children }: { children: ReactNode }) => <GeniFlowProvider>{children}</GeniFlowProvider>;

const SOURCE: SourceFieldValues = { title: 'T', url: 'https://x', citation: 'C', notes: 'N' };
const PERSON: GeniProfile = { id: 'profile-1', name: 'Ada', years: 'b. 1815', url: 'https://www.geni.com/people/Ada/1' };
const DOC: GeniDocument = { id: 'document-9', url: 'https://www.geni.com/documents/view?doc_id=9', tagged: true, taggedIds: ['profile-1'], failedIds: [] };

afterEach(() => sessionStorage.clear());

describe('GeniFlowProvider / useGeniFlow', () => {
  it('starts empty and persists each mutation to sessionStorage', () => {
    const { result } = renderHook(() => useGeniFlow(), { wrapper });
    expect(result.current.state.source).toBeNull();

    act(() => result.current.setSource(SOURCE));
    act(() => result.current.updateSearch({ surname: 'Lovelace' }));
    act(() => result.current.select(PERSON));

    expect(result.current.state.source).toEqual(SOURCE);
    expect(result.current.state.search.surname).toBe('Lovelace');
    expect(result.current.state.selected).toEqual(PERSON);

    const stored = JSON.parse(sessionStorage.getItem('rs_geni_flow')!);
    expect(stored.selected.id).toBe('profile-1');
    expect(stored.search.surname).toBe('Lovelace');
  });

  it('clearPerson keeps the source but drops person, result and search', () => {
    const { result } = renderHook(() => useGeniFlow(), { wrapper });
    act(() => result.current.setSource(SOURCE));
    act(() => result.current.updateSearch({ surname: 'Byron' }));
    act(() => result.current.select(PERSON));
    act(() => result.current.setSaved({ doc: DOC, people: [PERSON] }));

    act(() => result.current.clearPerson());
    expect(result.current.state.source).toEqual(SOURCE); // kept
    expect(result.current.state.selected).toBeNull();
    expect(result.current.state.saved).toBeNull();
    expect(result.current.state.search.surname).toBe('');
  });

  it('resetSearch and clearAll wipe the expected slices', () => {
    const { result } = renderHook(() => useGeniFlow(), { wrapper });
    act(() => result.current.setSource(SOURCE));
    act(() => result.current.updateSearch({ givenName: 'Ada' }));

    act(() => result.current.resetSearch());
    expect(result.current.state.search.givenName).toBe('');
    expect(result.current.state.source).toEqual(SOURCE); // resetSearch leaves source

    act(() => result.current.clearAll());
    expect(result.current.state.source).toBeNull();
  });

  it('seeds its initial state from sessionStorage', () => {
    sessionStorage.setItem('rs_geni_flow', JSON.stringify({ search: { surname: 'Rehydrated' } }));
    const { result } = renderHook(() => useGeniFlow(), { wrapper });
    expect(result.current.state.search.surname).toBe('Rehydrated');
    expect(result.current.state.search.givenName).toBe(''); // merged over empty defaults
  });

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useGeniFlow())).toThrow(/must be used inside GeniFlowProvider/);
  });
});
