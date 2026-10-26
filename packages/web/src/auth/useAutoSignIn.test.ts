import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoSignIn } from './useAutoSignIn';

const KEY = 'rs_auth_attempted_fs';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('useAutoSignIn', () => {
  it('redirects a fresh signed-out visitor exactly once and marks the attempt', () => {
    const start = vi.fn();
    const { result, rerender } = renderHook(() => useAutoSignIn('fs', false, start));
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.redirecting).toBe(true);
    expect(result.current.failed).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBe('1');
    // A re-render does not fire a second redirect.
    rerender();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('reports failed (no redirect) when returning with the attempt already used up', () => {
    sessionStorage.setItem(KEY, '1');
    const start = vi.fn();
    const { result } = renderHook(() => useAutoSignIn('fs', false, start));
    expect(start).not.toHaveBeenCalled();
    expect(result.current.failed).toBe(true);
    expect(result.current.redirecting).toBe(false);
  });

  it('clears the attempt once the user is authed', () => {
    sessionStorage.setItem(KEY, '1');
    const { result } = renderHook(() => useAutoSignIn('fs', true, vi.fn()));
    expect(result.current.redirecting).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('suspends the redirect while a return is being confirmed', () => {
    const start = vi.fn();
    const { result } = renderHook(() => useAutoSignIn('fs', false, start, true));
    expect(start).not.toHaveBeenCalled();
    expect(result.current.redirecting).toBe(false);
  });

  it('retry() redirects again; hold() and reset() manage the marker', () => {
    sessionStorage.setItem(KEY, '1');
    const start = vi.fn();
    const { result } = renderHook(() => useAutoSignIn('fs', false, start));

    act(() => result.current.retry());
    expect(start).toHaveBeenCalledTimes(1);
    expect(result.current.redirecting).toBe(true);

    act(() => result.current.hold());
    expect(result.current.failed).toBe(true);
    expect(sessionStorage.getItem(KEY)).toBe('1');

    act(() => result.current.reset());
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
