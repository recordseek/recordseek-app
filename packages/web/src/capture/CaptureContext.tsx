import { createContext, useContext, useMemo, type ReactNode } from 'react';
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

const CaptureContext = createContext<Capture | null>(null);

export function CaptureProvider({
  children,
  href = window.location.href,
}: {
  children: ReactNode;
  href?: string;
}) {
  const capture = useMemo(() => buildCapture(href), [href]);
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
