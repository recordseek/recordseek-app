import { describe, it, expect, vi, afterEach } from 'vitest';
import { FamilySearchClient, FsApiError, FsNetworkError } from '@recordseek/core';
import { isFsAuthenticated, completeFsLogin } from './fsAuth';

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

describe('completeFsLogin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('retries the code exchange once when the connection drops', async () => {
    window.history.replaceState({}, '', '/?code=abc');
    const exchange = vi
      .spyOn(FamilySearchClient.prototype, 'exchangeToken')
      .mockRejectedValueOnce(new FsNetworkError('Network error contacting FamilySearch'))
      .mockResolvedValueOnce('tok');
    expect(await completeFsLogin(0)).toBe('/fs-source');
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it('does not retry a rejected code', async () => {
    window.history.replaceState({}, '', '/?code=abc');
    const exchange = vi
      .spyOn(FamilySearchClient.prototype, 'exchangeToken')
      .mockRejectedValue(new FsApiError(400, '{"error":"invalid_grant"}'));
    await expect(completeFsLogin(0)).rejects.toBeInstanceOf(FsApiError);
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});
