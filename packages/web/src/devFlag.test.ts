import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isDevMode } from './devFlag';

function setUrl(url: string): void {
  window.history.replaceState(null, '', url);
}

describe('isDevMode', () => {
  beforeEach(() => {
    setUrl('/');
    sessionStorage.clear();
  });

  it('is off by default', () => {
    expect(isDevMode()).toBe(false);
  });

  it('turns on from the query string and is remembered', () => {
    setUrl('/?url=x&dev=1');
    expect(isDevMode()).toBe(true);
    expect(sessionStorage.getItem('rs_dev')).toBe('1');
    setUrl('/');
    expect(isDevMode()).toBe(true);
  });

  it('turns on from the hash route query', () => {
    setUrl('/#/?dev=1');
    expect(isDevMode()).toBe(true);
  });

  it('dev=0 clears it', () => {
    sessionStorage.setItem('rs_dev', '1');
    setUrl('/?dev=0');
    expect(isDevMode()).toBe(false);
    expect(sessionStorage.getItem('rs_dev')).toBeNull();
  });

  it('ignores and clears the old site-wide flag from earlier builds', async () => {
    localStorage.setItem('rs_dev', '1');
    vi.resetModules();
    const fresh = await import('./devFlag');
    expect(fresh.isDevMode()).toBe(false);
    expect(localStorage.getItem('rs_dev')).toBeNull();
  });
});
