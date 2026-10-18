import { describe, it, expect, beforeEach } from 'vitest';
import { isDevMode } from './devFlag';

function setUrl(url: string): void {
  window.history.replaceState(null, '', url);
}

describe('isDevMode', () => {
  beforeEach(() => setUrl('/'));

  it('is off by default', () => {
    expect(isDevMode()).toBe(false);
  });

  it('turns on from the query string and is remembered', () => {
    setUrl('/?url=x&dev=1');
    expect(isDevMode()).toBe(true);
    expect(localStorage.getItem('rs_dev')).toBe('1');
    setUrl('/');
    expect(isDevMode()).toBe(true);
  });

  it('turns on from the hash route query', () => {
    setUrl('/#/?dev=1');
    expect(isDevMode()).toBe(true);
  });

  it('dev=0 clears it', () => {
    localStorage.setItem('rs_dev', '1');
    setUrl('/?dev=0');
    expect(isDevMode()).toBe(false);
    expect(localStorage.getItem('rs_dev')).toBeNull();
  });
});
