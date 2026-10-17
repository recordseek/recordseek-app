import {
  FamilySearchClient,
  resolveRedirectUri,
  type FsEnvironment,
  type TokenStore,
} from '@recordseek/core';

const TOKEN_KEY = 'fs_access_token';

// Fallback when sessionStorage is blocked: the token lasts for this page only.
let memoryToken: string | null = null;

/** Browser token store. Session-scoped so the token never persists to disk. */
function sessionTokenStore(): TokenStore {
  return {
    get: () => {
      try {
        return sessionStorage.getItem(TOKEN_KEY) ?? memoryToken;
      } catch {
        return memoryToken;
      }
    },
    set: (token: string) => {
      memoryToken = token;
      try {
        sessionStorage.setItem(TOKEN_KEY, token);
      } catch {
        /* blocked storage: keep the in-memory copy */
      }
    },
    clear: () => {
      memoryToken = null;
      try {
        sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        /* nothing stored */
      }
    },
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
    redirectUri: resolveRedirectUri(window.location.origin, import.meta.env.BASE_URL),
    tokenStore: sessionTokenStore(),
  });
}
