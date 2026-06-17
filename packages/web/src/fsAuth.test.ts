import { describe, it, expect } from 'vitest';
import { isFsAuthenticated } from './fsAuth';

describe('isFsAuthenticated', () => {
  it('is false without a token and true once one is stored', () => {
    expect(isFsAuthenticated()).toBe(false);
    sessionStorage.setItem('fs_access_token', 'a-token');
    expect(isFsAuthenticated()).toBe(true);
  });

  it('treats the literal string "undefined" as not authenticated', () => {
    sessionStorage.setItem('fs_access_token', 'undefined');
    expect(isFsAuthenticated()).toBe(false);
  });
});
