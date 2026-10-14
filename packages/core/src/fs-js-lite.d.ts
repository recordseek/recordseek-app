/** Minimal typings for the parts of fs-js-lite v3 (untyped ESM) that we use. */
declare module 'fs-js-lite' {
  export interface FsJsLiteResponse {
    statusCode: number;
    statusText: string;
    headers: Record<string, string>;
    body?: string;
    /** Present only when the body was JSON. */
    data?: any;
    originalUrl: string;
    effectiveUrl: string;
    requestMethod: string;
    requestHeaders: Record<string, string>;
    redirected: boolean;
    throttled: boolean;
    retries: number;
  }

  export interface FsJsLiteRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
    getHeaders(): Record<string, string>;
  }

  export type FsJsLiteCallback = (error?: unknown, response?: FsJsLiteResponse) => void;

  export interface FsJsLiteOptions {
    appKey?: string;
    redirectUri?: string;
    environment?: 'production' | 'beta' | 'integration';
    accessToken?: string;
    saveAccessToken?: boolean;
    maxThrottledRetries?: number;
  }

  export interface FsJsLiteClient {
    platformHost(): string;
    identHost(): string;
    setAccessToken(token: string): FsJsLiteClient;
    getAccessToken(): string | undefined;
    oauthRedirectURL(options?: string | { state?: string; codeChallenge?: string; scope?: string }): string;
    oauthToken(code: string, codeVerifier: string | undefined, callback: FsJsLiteCallback): void;
    request(
      url: string,
      options: { method?: string; headers?: Record<string, string>; body?: unknown },
      callback: FsJsLiteCallback,
    ): void;
    addRequestMiddleware(
      middleware: (
        client: FsJsLiteClient,
        request: FsJsLiteRequest,
        next: (error?: unknown, response?: FsJsLiteResponse) => void,
      ) => void,
    ): void;
  }

  const FamilySearch: new (options?: FsJsLiteOptions) => FsJsLiteClient;
  export default FamilySearch;
}
