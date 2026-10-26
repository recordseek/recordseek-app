import posthog from 'posthog-js';

/** Public PostHog project key (a client key, safe to ship). Override with VITE_POSTHOG_KEY. */
const DEFAULT_POSTHOG_KEY = 'phc_AzZzdRdxntXqHxNiJ4nM9duEnprenXt8XnKA2NKEoeFG';

type Props = Record<string, unknown>;

/**
 * Which deployment served this page, from the hostname: `production`
 * (recordseek.com), `stage` (the GitHub Pages preview) or `development`
 * (localhost / *.local). Registered on every event so we can always tell which
 * environment an entry came from. Pure (takes the hostname) so it is testable.
 */
export function deployEnv(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): string {
  const h = hostname.toLowerCase();
  if (h === 'recordseek.com' || h === 'www.recordseek.com') return 'production';
  if (h.endsWith('.github.io')) return 'stage';
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local') || h.endsWith('.localhost') || h.endsWith('.test')) {
    return 'development';
  }
  return h || 'unknown';
}

/** Event shape we touch in before_send (a subset of posthog-js's CaptureResult). */
export interface AnalyticsEvent {
  properties?: Props;
  $set?: Props;
  $set_once?: Props;
}

/**
 * Share URLs carry the captured page's URL, title, citation and notes in the
 * query, and OAuth `code`/tokens after login. Analytics only ever gets the
 * origin, the path and the hash *route* (`#/fs-search`): never a query string.
 */
function splitUrl(raw: string): { base: string; route: string } | null {
  try {
    const u = new URL(raw);
    // Keep the hash only when it is a router path (#/x or #!/x); drop anything
    // after "?" in it, and drop non-route fragments (e.g. #access_token=…).
    const m = /^#!?(\/[^?#]*)/.exec(u.hash);
    const route = m ? `#${m[1]}` : '';
    return { base: u.origin + u.pathname, route };
  } catch {
    return null;
  }
}

/** origin + pathname + hash route, with no query string anywhere. */
export function sanitizeUrl(raw: string): string {
  const parts = splitUrl(raw);
  return parts ? parts.base + parts.route : raw.split(/[?#]/)[0] ?? '';
}

/** Pathname plus hash route (what `$pathname` should hold for a hash-routed app). */
export function sanitizePathname(raw: string): string {
  try {
    const u = new URL(raw, 'https://x.invalid');
    const m = /^#!?(\/[^?#]*)/.exec(u.hash);
    return u.pathname + (m ? `#${m[1]}` : '');
  } catch {
    return raw.split(/[?#]/)[0] ?? '';
  }
}

/** Referrers are reduced to their origin (PostHog uses "$direct" for none). */
export function sanitizeReferrer(raw: string): string {
  try {
    const u = new URL(raw);
    return u.origin === 'null' ? '' : u.origin;
  } catch {
    return raw.startsWith('$') ? raw : '';
  }
}

const URL_KEYS = /^\$(?:initial_|session_entry_)?(?:current_url|url)$|^\$last_external_click_url$|^\$prev_pageview_url$/;
const PATH_KEYS = /^\$(?:initial_|session_entry_)?pathname$|^\$prev_pageview_pathname$/;
const REFERRER_KEYS = /^\$(?:initial_|session_entry_)?referrer$/;

function sanitizeBag(bag: Props | undefined): void {
  if (!bag) return;
  for (const key of Object.keys(bag)) {
    const value = bag[key];
    if (typeof value !== 'string') continue;
    if (URL_KEYS.test(key)) {
      bag[key] = sanitizeUrl(value);
    } else if (PATH_KEYS.test(key)) {
      bag[key] = sanitizePathname(value);
    } else if (REFERRER_KEYS.test(key)) {
      bag[key] = sanitizeReferrer(value);
    }
  }
}

/** PostHog before_send hook: strips query strings / fragments from every URL-ish property. */
export function sanitizeEvent<T extends AnalyticsEvent>(event: T | null): T | null {
  if (!event) return event;
  const props = event.properties;
  if (props && typeof props.$current_url === 'string') {
    // $pathname is derived from the current URL (route included).
    props.$pathname = sanitizePathname(props.$current_url);
  }
  sanitizeBag(props);
  sanitizeBag(event.$set);
  sanitizeBag(event.$set_once);
  return event;
}

let initialized = false;

/**
 * Product analytics for production builds only (never dev/tests). Anonymous
 * except for signed-in FamilySearch users, who are identified by a one-way hash
 * of their FamilySearch user id (see identifyFsUser). No autocapture, no session
 * recording; every URL is scrubbed.
 */
export function initAnalytics(): void {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  if (!env.PROD || initialized) {
    return;
  }
  const key = typeof env.VITE_POSTHOG_KEY === 'string' && env.VITE_POSTHOG_KEY ? env.VITE_POSTHOG_KEY : DEFAULT_POSTHOG_KEY;
  try {
    posthog.init(key, {
      api_host: 'https://us.i.posthog.com',
      person_profiles: 'identified_only',
      // Not a cookie: the extension's "forget my session" clears recordseek.com
      // cookies before each capture, which would mint a new anonymous id every time.
      persistence: 'localStorage',
      autocapture: false,
      capture_pageview: 'history_change',
      capture_pageleave: true,
      disable_session_recording: true,
      capture_performance: false,
      capture_dead_clicks: false,
      disable_surveys: true,
      capture_exceptions: false,
      before_send: (event) => sanitizeEvent(event),
    });
    posthog.register({
      app: 'share',
      env: deployEnv(),
      ...(typeof env.VITE_RELEASE === 'string' && env.VITE_RELEASE ? { app_version: env.VITE_RELEASE } : {}),
    });
    initialized = true;
  } catch {
    // Analytics must never break the app.
  }
}

/**
 * Record a product event. Props must be coarse (booleans, counts, enums, a bare
 * domain): never names, ids, URLs, titles, citations or notes. No-op until
 * initAnalytics() has run. `beacon` sends instantly via sendBeacon, for events
 * fired just before the page navigates away.
 */
export function track(
  event: string,
  props?: Record<string, string | number | boolean | null>,
  options?: { beacon?: boolean },
): void {
  if (!initialized) return;
  try {
    posthog.capture(event, props, options?.beacon ? { transport: 'sendBeacon', send_instantly: true } : undefined);
  } catch {
    // ignore
  }
}

const FS_ID_PREFIX = 'fs_';

/**
 * Stable pseudonymous PostHog id for a FamilySearch user: a SHA-256 of their
 * FamilySearch user id, so the same person is one user across devices without
 * PostHog ever seeing the id, name or email.
 */
export async function fsDistinctId(fsUserId: string): Promise<string> {
  return accountHash('fs', fsUserId);
}

/**
 * One-way, per-provider hash of an account id (`fs_`, `geni_` or `zotero_` + 32 hex).
 * The same scheme PostHog uses, so the newsletter server never sees a real id either.
 */
export async function accountHash(provider: 'fs' | 'geni' | 'zotero', id: string): Promise<string> {
  const bytes = new TextEncoder().encode(`recordseek-${provider}:${id}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `${provider}_` + Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Identify the signed-in FamilySearch user (no person properties are sent). */
export async function identifyFsUser(fsUserId: string): Promise<void> {
  if (!initialized || !fsUserId) return;
  try {
    const id = await fsDistinctId(fsUserId);
    const current = posthog.get_distinct_id();
    if (current === id) return;
    // A different FamilySearch user on this browser (shared computer): start a
    // fresh anonymous id instead of merging them into the previous person.
    if (current.startsWith(FS_ID_PREFIX)) posthog.reset();
    posthog.identify(id);
  } catch {
    // ignore
  }
}

/** Forget the identified user on FamilySearch sign-out. */
export function resetAnalytics(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    // ignore
  }
}

/** Super properties that attribute a capture to a partner site (RecordSeek SDK). */
const ATTRIBUTION_PROPS = ['capture_entry', 'referrer_host', 'referrer_partner', 'sdk_version'] as const;

export interface CaptureAttribution {
  entry?: string;
  host?: string;
  partner?: string;
  sdkVersion?: string;
}

const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const PARTNER_RE = /^[A-Za-z0-9._-]{1,64}$/;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,32})?$/;

/** A bare hostname (no scheme, port, path or credentials), lowercased; else ''. */
export function sanitizeHost(raw: unknown): string {
  const host = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/^www\./, '') : '';
  return HOST_RE.test(host) ? host : '';
}

/** A partner id limited to [A-Za-z0-9._-]{1,64}; else ''. */
export function sanitizePartner(raw: unknown): string {
  return typeof raw === 'string' && PARTNER_RE.test(raw) ? raw : '';
}

/** A semver-ish SDK version; else ''. */
export function sanitizeSdkVersion(raw: unknown): string {
  return typeof raw === 'string' && VERSION_RE.test(raw) ? raw : '';
}

/**
 * Which attribution super properties to set and which to clear. Without an
 * entry there is nothing to attribute, so every key is cleared (a later
 * non-SDK capture must not inherit a previous partner).
 */
export function planAttribution(attr: CaptureAttribution | null): { register: Props; unregister: string[] } {
  const register: Props = {};
  if (attr?.entry === 'sdk') {
    register.capture_entry = 'sdk';
    const host = sanitizeHost(attr.host);
    const partner = sanitizePartner(attr.partner);
    const version = sanitizeSdkVersion(attr.sdkVersion);
    if (host) register.referrer_host = host;
    if (partner) register.referrer_partner = partner;
    if (version) register.sdk_version = version;
  }
  return { register, unregister: ATTRIBUTION_PROPS.filter((k) => !(k in register)) };
}

/**
 * Attribute this browser's events to a partner capture. Super properties live
 * in localStorage, so they survive the FamilySearch OAuth round-trip; call this
 * only for a load that carries a capture (`url`), with `null`/non-SDK entry to
 * clear a previous attribution. No-op until initAnalytics() has run.
 */
export function setCaptureAttribution(attr: CaptureAttribution | null): void {
  if (!initialized) return;
  try {
    const { register, unregister } = planAttribution(attr);
    for (const key of unregister) posthog.unregister(key);
    if (Object.keys(register).length > 0) posthog.register(register);
  } catch {
    // ignore
  }
}

/**
 * The client that produced a capture: a specific browser extension, a native
 * app, the bookmarklet or the partner SDK. Registered (with its version) as a
 * super property so every event — not just `capture_opened` — says which
 * extension/app/version it came from. The extension sends its browser name (`e`)
 * and version (`ev`); the native apps send an `app=` marker.
 */
export type CaptureClientType =
  | 'chrome_extension'
  | 'firefox_extension'
  | 'edge_extension'
  | 'opera_extension'
  | 'safari_extension'
  | 'ios_app'
  | 'bookmarklet'
  | 'sdk'
  | 'extension';

const CLIENT_PROPS = ['capture_client', 'capture_client_version'] as const;
const CLIENT_VERSION_RE = /^[A-Za-z0-9][\w.+-]{0,31}$/;

/** A client version from the extension/app (`ev`): short and version-ish; else ''. */
export function sanitizeClientVersion(raw: unknown): string {
  return typeof raw === 'string' && CLIENT_VERSION_RE.test(raw) ? raw : '';
}

export interface CaptureClient {
  type?: CaptureClientType | '';
  version?: string;
}

/**
 * Which client super properties to set and which to clear. Without a type there
 * is nothing to attribute, so both keys clear (a later capture from a different
 * client must not inherit the previous one's type or version).
 */
export function planClient(client: CaptureClient | null): { register: Props; unregister: string[] } {
  const register: Props = {};
  if (client?.type) {
    register.capture_client = client.type;
    const version = sanitizeClientVersion(client.version);
    if (version) register.capture_client_version = version;
  }
  return { register, unregister: CLIENT_PROPS.filter((k) => !(k in register)) };
}

/**
 * Attribute this browser's events to the client that produced the capture.
 * Super properties persist (localStorage), so they survive the FamilySearch
 * OAuth round-trip; call this only for a load that carries a capture. No-op
 * until initAnalytics() has run.
 */
export function setCaptureClient(client: CaptureClient | null): void {
  if (!initialized) return;
  try {
    const { register, unregister } = planClient(client);
    for (const key of unregister) posthog.unregister(key);
    if (Object.keys(register).length > 0) posthog.register(register);
  } catch {
    // ignore
  }
}
