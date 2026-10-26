import { describe, it, expect, afterEach, vi } from 'vitest';
import { FamilySearchClient } from '@recordseek/core';
import { getFsConfig, createFsClient } from './fsClient';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('getFsConfig', () => {
  it('defaults to the beta sandbox with PKCE on when env is unset', () => {
    vi.stubEnv('VITE_FS_APP_KEY', '');
    vi.stubEnv('VITE_FS_ENV', '');
    vi.stubEnv('VITE_FS_PKCE', '');
    const cfg = getFsConfig();
    expect(cfg.environment).toBe('beta'); // empty falls back to the safe sandbox
    expect(cfg.pkce).toBe(true);
    expect(cfg.appKey).toBe('');
  });

  it('reads explicit env values and disables PKCE only on the literal "false"', () => {
    vi.stubEnv('VITE_FS_APP_KEY', 'KEY-1');
    vi.stubEnv('VITE_FS_ENV', 'production');
    vi.stubEnv('VITE_FS_PKCE', 'false');
    const cfg = getFsConfig();
    expect(cfg).toEqual({ appKey: 'KEY-1', environment: 'production', pkce: false });
  });
});

describe('createFsClient', () => {
  it('builds a FamilySearchClient with a session-scoped token store', () => {
    vi.stubEnv('VITE_FS_APP_KEY', 'KEY-1');
    vi.stubEnv('VITE_FS_ENV', 'beta');
    const client = createFsClient();
    expect(client).toBeInstanceOf(FamilySearchClient);

    // The store roundtrips through sessionStorage.
    client.setAccessToken('tok-abc');
    expect(sessionStorage.getItem('fs_access_token')).toBe('tok-abc');
    expect(client.getAccessToken()).toBe('tok-abc');
  });

  it('keeps the token in memory when sessionStorage is blocked', () => {
    vi.stubEnv('VITE_FS_APP_KEY', 'KEY-1');
    const client = createFsClient();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    client.setAccessToken('tok-mem');
    expect(client.getAccessToken()).toBe('tok-mem'); // memory fallback
  });
});
