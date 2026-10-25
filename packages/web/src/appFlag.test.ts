import { describe, it, expect, beforeEach } from 'vitest';
import { isNativeApp } from './appFlag';

function setUrl(url: string): void {
  window.history.replaceState(null, '', url);
}

describe('isNativeApp', () => {
  beforeEach(() => {
    setUrl('/');
    sessionStorage.clear();
  });

  it('is off by default (the website)', () => {
    expect(isNativeApp()).toBe(false);
  });

  it('turns on from the query marker and is remembered for the tab', () => {
    setUrl('/?url=x&app=ios');
    expect(isNativeApp()).toBe(true);
    expect(sessionStorage.getItem('rs_app')).toBe('1');
    setUrl('/'); // query dropped after a sign-in round-trip
    expect(isNativeApp()).toBe(true);
  });

  it('turns on from the hash route query', () => {
    setUrl('/#/?app=ios');
    expect(isNativeApp()).toBe(true);
  });

  it('app=0 clears it', () => {
    sessionStorage.setItem('rs_app', '1');
    setUrl('/?app=0');
    expect(isNativeApp()).toBe(false);
    expect(sessionStorage.getItem('rs_app')).toBeNull();
  });
});
