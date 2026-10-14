import {
  FamilySearchClient,
  resolveRedirectUri,
  type FsEnvironment,
  type TokenStore,
} from '@recordseek/core';

const TOKEN_KEY = 'fs_access_token';

/** Browser token store. Session-scoped so the token never persists to disk. */
function sessionTokenStore(): TokenStore {
  return {
    get: () => sessionStorage.getItem(TOKEN_KEY),
    set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
    clear: () => sessionStorage.removeItem(TOKEN_KEY),
  };
}

export interface FsRuntimeConfig {
  appKey: string;
  environment: FsEnvironment;
  /** Send a PKCE challenge on login. Set VITE_FS_PKCE=false to match the legacy (no-PKCE) web flow. */
  pkce: boolean;
}

export function getFsConfig(): FsRuntimeConfig {
  const env = import.meta.env as Record<string, string | undefined>;
  const appKey = env.VITE_FS_APP_KEY ?? '';
  // `||` (not `??`) so an empty value also falls back to the safe sandbox env.
  const environment = (env.VITE_FS_ENV || 'beta') as FsEnvironment;
  const pkce = env.VITE_FS_PKCE !== 'false';
  return { appKey, environment, pkce };
}

export function createFsClient(): FamilySearchClient {
  const { appKey, environment } = getFsConfig();
  return new FamilySearchClient({
    appKey,
    environment,
    redirectUri: resolveRedirectUri(window.location.origin),
    tokenStore: sessionTokenStore(),
  });
}
