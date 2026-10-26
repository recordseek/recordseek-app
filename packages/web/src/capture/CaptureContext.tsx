import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  track,
  setCaptureAttribution,
  setCaptureClient,
  sanitizeHost,
  sanitizePartner,
  sanitizeSdkVersion,
  type CaptureClientType,
} from '../analytics';
import { parseShareParams, extractPersonParams, deriveSourceMetadata, normalizeUrl, type PersonParams } from '@recordseek/core';

/** The normalized capture, derived once from the share URL via core. */
export interface Capture {
  url: string;
  title: string;
  publisher: string;
  domain: string;
  notes: string;
  /** Human "accessed" date, from the capture timestamp (`_`) — legacy parity. */
  accessedDate: string;
  /** Principal-person params from genscrape, when the extension recognized the page. */
  person?: PersonParams;
}

function str(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function formatAccessedDate(raw: string): string {
  const ms = Number(raw);
  const date = Number.isFinite(ms) && ms > 0 ? new Date(ms) : new Date();
  return `${date.getDate()} ${date.toLocaleString('en-US', { month: 'long' })} ${date.getFullYear()}`;
}

const CAPTURE_KEY = 'rs_capture_href';

export function buildCapture(href: string): Capture {
  let params = parseShareParams(href);
  if (typeof params.url === 'string' && params.url) {
    // Persist the capture so it survives a FamilySearch OAuth round-trip.
    try {
      window.sessionStorage.setItem(CAPTURE_KEY, href);
    } catch {
      /* ignore */
    }
  } else {
    // No capture in the URL (e.g. an OAuth return) — restore the last one.
    try {
      const saved = window.sessionStorage.getItem(CAPTURE_KEY);
      if (saved) {
        params = parseShareParams(saved);
      }
    } catch {
      /* ignore */
    }
  }
  const url = normalizeUrl(str(params.url));
  // Legacy parity: fall back to the page <h1> when there is no <title>.
  const rawTitle = str(params.title) || str(params.h1);
  const { title, publisher, domain } = deriveSourceMetadata({ url, title: rawTitle });
  return {
    url,
    title,
    publisher,
    domain,
    notes: str(params.notes),
    accessedDate: formatAccessedDate(str(params._)),
    person: extractPersonParams(params),
  };
}

export type CaptureEntry = 'sdk' | 'extension' | 'bookmarklet' | 'unknown';

/**
 * How the capture reached us. The extension always adds its browser name (`e`)
 * and version (`ev`); the bookmarklet (and the mobile share sheet, which copies
 * its query) never does. The partner SDK marks itself with `rs_src=sdk`, which
 * wins over the extension/bookmarklet rule. No `url` means there is no capture to classify.
 */
export function detectEntry(href: string): CaptureEntry {
  const params = parseShareParams(href);
  if (typeof params.url !== 'string' || !params.url) {
    return 'unknown';
  }
  if (str(params.rs_src) === 'sdk') {
    return 'sdk';
  }
  return params.e || params.ev ? 'extension' : 'bookmarklet';
}

// Every browser the extension ships for (recordseek-extensions/src/vendor/*).
// Each vendor's browser.js reports its own `name`, mapped here to a distinct
// `<name>_extension` client type; an unlisted browser is a generic 'extension'.
const EXTENSION_BROWSERS = new Set([
  'chrome',
  'edge',
  'firefox',
  'opera',
  'safari',
  'brave',
  'vivaldi',
  'yandex',
  'arc',
  'whale',
  'samsung',
  'orion',
  'chromium',
]);

/**
 * The specific client that produced the capture and its own version, from the
 * `app=` marker (native apps), the browser name `e` and version `ev` (the
 * extension). Returns an empty type when there is no capture to attribute.
 */
export function detectClient(href: string): { type: CaptureClientType | ''; version: string } {
  const params = parseShareParams(href);
  if (typeof params.url !== 'string' || !params.url) {
    return { type: '', version: '' };
  }
  const version = str(params.ev);
  if (str(params.rs_src) === 'sdk') {
    return { type: 'sdk', version: '' };
  }
  const app = str(params.app);
  if (app === 'ios') return { type: 'ios_app', version };
  // The Safari extension (shipped as the Mac App Store app) sends app=safari.
  if (app === 'safari') return { type: 'safari_extension', version };
  const browser = str(params.e).toLowerCase();
  if (browser && EXTENSION_BROWSERS.has(browser)) return { type: `${browser}_extension` as CaptureClientType, version };
  if (browser || params.ev) return { type: 'extension', version };
  return { type: 'bookmarklet', version: '' };
}

/** Bare hostname (no `www.`) of the captured page; the only part of it analytics may see. */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

const CaptureContext = createContext<Capture | null>(null);

export function CaptureProvider({
  children,
  href = window.location.href,
}: {
  children: ReactNode;
  href?: string;
}) {
  const capture = useMemo(() => buildCapture(href), [href]);
  const reported = useRef<string | null>(null);

  // Once per capture load. An OAuth return carries no `url` (the capture is
  // restored from sessionStorage), so it is not counted again.
  useEffect(() => {
    if (reported.current === href) return;
    reported.current = href;
    const params = parseShareParams(href);
    if (typeof params.url !== 'string' || !params.url) return;
    const entry = detectEntry(href);
    const client = detectClient(href);
    const host = sanitizeHost(str(params.rs_host));
    const partner = sanitizePartner(str(params.rs_partner));
    // Only a load that carries a capture (`url`) updates attribution, so the
    // OAuth return (no capture params) keeps the stored super properties.
    setCaptureAttribution({ entry, host, partner, sdkVersion: sanitizeSdkVersion(str(params.rs_v)) });
    setCaptureClient(client);
    track('capture_opened', {
      source_domain: sourceDomain(capture.url),
      entry,
      ...(client.type ? { client: client.type } : {}),
      ...(entry === 'sdk' && host ? { referrer_host: host } : {}),
      ...(entry === 'sdk' && partner ? { referrer_partner: partner } : {}),
      has_citation: Boolean(params.citation),
      has_notes: Boolean(params.notes),
      has_person_hint: Boolean(capture.person),
    });
  }, [href, capture]);
  return <CaptureContext.Provider value={capture}>{children}</CaptureContext.Provider>;
}

export function useCapture(): Capture {
  const ctx = useContext(CaptureContext);
  if (!ctx) {
    throw new Error('useCapture must be used within a CaptureProvider');
  }
  return ctx;
}

/** Like {@link useCapture} but returns null outside a provider. */
export function useOptionalCapture(): Capture | null {
  return useContext(CaptureContext);
}
