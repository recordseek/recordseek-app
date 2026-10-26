import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  loadAncestry2Flow,
  storeAncestry2Flow,
  useAncestry2Flow,
  ancestryPersonUrl,
} from './flow';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('loadAncestry2Flow', () => {
  it('returns the empty shape when nothing is stored', () => {
    expect(loadAncestry2Flow()).toMatchObject({ account: null, treeId: '', givenName: '', jobId: null });
  });

  it('merges stored fields over the empty defaults', () => {
    sessionStorage.setItem('rs_ancestry2_flow', JSON.stringify({ treeId: 'T1', givenName: 'Ada' }));
    const s = loadAncestry2Flow();
    expect(s.treeId).toBe('T1');
    expect(s.givenName).toBe('Ada');
    expect(s.saved).toBeNull(); // untouched default
  });

  it('falls back to empty on corrupt JSON', () => {
    sessionStorage.setItem('rs_ancestry2_flow', '{not json');
    expect(loadAncestry2Flow().treeId).toBe('');
  });
});

describe('storeAncestry2Flow', () => {
  it('persists and reports success', () => {
    const ok = storeAncestry2Flow({ ...loadAncestry2Flow(), surname: 'Lovelace' });
    expect(ok).toBe(true);
    expect(loadAncestry2Flow().surname).toBe('Lovelace');
  });

  it('reports false when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(storeAncestry2Flow(loadAncestry2Flow())).toBe(false);
  });
});

describe('useAncestry2Flow', () => {
  it('updates state and writes through to sessionStorage', () => {
    const { result } = renderHook(() => useAncestry2Flow());
    act(() => {
      result.current[1]({ treeId: 'T9', surname: 'Byron' });
    });
    expect(result.current[0].treeId).toBe('T9');
    expect(JSON.parse(sessionStorage.getItem('rs_ancestry2_flow')!).surname).toBe('Byron');
  });
});

describe('ancestryPersonUrl', () => {
  it('builds an encoded facts URL', () => {
    expect(ancestryPersonUrl('tree 1', 'p/2')).toBe(
      'https://www.ancestry.com/family-tree/person/tree/tree%201/person/p%2F2/facts',
    );
  });
});
