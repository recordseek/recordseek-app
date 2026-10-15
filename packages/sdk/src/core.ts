/**
 * RecordSeek developer kit. Finds `.recordseek` / `[data-recordseek]` elements,
 * renders a button and opens the RecordSeek share app on click, exactly like the
 * bookmarklet. Zero dependencies; never throws into the host page.
 */
import { buildShareUrl } from '@recordseek/core/share-params';
import { parseData, sanitizePartner, type ParsedData } from './keys';
import { scrapePage } from './scrape';
import { createButton, injectStyles } from './render';
import { genscrapeResult, getBase, initBase, preloadGenscrape, runGenscrape } from './genscrape';

export const VERSION = __SDK_VERSION__;
const DEFAULT_BASE = 'https://recordseek.com/share/';
const SELECTOR = '.recordseek, [data-recordseek]';
const FEATURES = 'width=800,height=620,scrollbars=yes,resizable=yes,toolbar=no,location=yes,menubar=no,status=no';
const SCRAPE_WAIT_MS = 2500;

interface Config {
  base?: string;
  /** Directory serving genscrape.js (testing). */
  sdkBase?: string;
  partner?: string;
  injectStyles?: boolean;
}

type Win = Window & { RecordSeekConfig?: Config; RecordSeek?: unknown };

function config(): Config {
  const c = (window as Win).RecordSeekConfig;
  return c && typeof c === 'object' ? c : {};
}

/** Relative values resolve against the page; non-http(s) results fall back to the page URL. */
export function resolveUrl(value: string | undefined): string {
  try {
    const u = new URL(value || '', window.location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch {
    // fall through
  }
  return window.location.href;
}

/**
 * Build the share URL. Precedence per field: explicit data-* > genscrape >
 * generic page scrape (or just url/title defaults when scraping is off).
 */
export function buildUrl(parsed: ParsedData, scraped?: object | null, selection = '', entry: 'sdk' | 'bookmarklet' = 'sdk'): string {
  const page = parsed.scrape
    ? scrapePage(selection)
    : { url: window.location.href, title: document.title || '' };
  const fields: Record<string, string> = { ...page, ...((parsed.scrape && scraped ? scraped : {}) as Record<string, string>), ...parsed.share };
  fields.url = resolveUrl(fields.url);
  const cfg = config();
  const partner = parsed.partner || sanitizePartner(typeof cfg.partner === 'string' ? cfg.partner : '');
  const base = typeof cfg.base === 'string' && cfg.base ? cfg.base : DEFAULT_BASE;
  return buildShareUrl(
    {
      _: Date.now(),
      ...fields,
      rs_src: entry,
      rs_v: VERSION,
      // The bookmarklet runs on whatever page the visitor is reading, not a partner's.
      ...(entry === 'sdk' ? { rs_host: window.location.hostname.toLowerCase(), rs_partner: partner } : {}),
    },
    base,
  );
}

function openUrl(url: string): void {
  const win = window.open(url, 'recordseek', FEATURES);
  if (!win) window.open(url, '_blank');
}

/**
 * Open the share app for `parsed`. With scraping on and genscrape not finished,
 * open a blank popup synchronously (keeps popup blockers happy) and navigate it
 * when the scrape finishes or after 2.5 s, whichever is first.
 */
function launch(parsed: ParsedData, selection: string): void {
  if (!parsed.scrape) return openUrl(buildUrl(parsed));
  const ready = genscrapeResult();
  if (ready !== undefined) return openUrl(buildUrl(parsed, ready, selection));
  const win = window.open('about:blank', 'recordseek', FEATURES);
  if (!win) {
    // Blocked: nothing more can be opened later, so go with what we have now.
    window.open(buildUrl(parsed, null, selection), '_blank');
    return;
  }
  const go = () => {
    try {
      win.location.href = buildUrl(parsed, genscrapeResult() ?? null, selection);
    } catch {
      // popup closed by the visitor
    }
  };
  let done = false;
  const once = () => {
    if (!done) {
      done = true;
      go();
    }
  };
  const timer = setTimeout(once, SCRAPE_WAIT_MS);
  runGenscrape().then(() => {
    clearTimeout(timer);
    once();
  }, once);
}

export function datasetOf(el: Element): Record<string, unknown> {
  return { ...((el as HTMLElement).dataset || {}) };
}

const processed = new WeakSet<Element>();
let wantsScrape = false;

/** Render a button inside `el`, reading its data-* attributes (and `data` overrides). */
export function button(el: Element, data?: Record<string, unknown>): void {
  try {
    if (processed.has(el)) return;
    processed.add(el);
    el.setAttribute('data-rs-ready', '1');
    const parsed = parseData({ ...datasetOf(el), ...(data || {}) });
    if (!parsed.ui.noStyle && config().injectStyles !== false) injectStyles();
    let selection = '';
    const btn = createButton(
      parsed.ui,
      () => {
        try {
          // Re-read at click time so scripts can update data-* after load.
          launch(parseData({ ...datasetOf(el), ...(data || {}) }), selection);
        } catch {
          // never throw into the host page
        }
      },
      () => {
        try {
          selection = String(window.getSelection ? window.getSelection() : '');
        } catch {
          selection = '';
        }
      },
    );
    el.replaceChildren(btn);
    if (parsed.scrape && !wantsScrape) {
      wantsScrape = true;
      preloadGenscrape();
    }
  } catch {
    // never throw into the host page
  }
}

/** Find and render every unprocessed RecordSeek element under `root`. Idempotent. */
export function scan(root?: ParentNode): void {
  try {
    const scope: ParentNode = root || document;
    if (root instanceof Element && root.matches(SELECTOR)) button(root);
    scope.querySelectorAll(SELECTOR).forEach((el) => button(el));
  } catch {
    // never throw into the host page
  }
}

/** Programmatic open with the same keys as the data-* attributes. */
export function open(data?: Record<string, unknown>): void {
  try {
    launch(parseData(data), '');
  } catch {
    // never throw into the host page
  }
}

/** Expose window.RecordSeek and auto-scan (DOMContentLoaded + MutationObserver). */
export function install(): void {
  const w = window as Win;
  if (w.RecordSeek) return; // loaded twice
  const cs = document.currentScript as HTMLScriptElement | null;
  initBase(cs && cs.src, config().sdkBase);
  w.RecordSeek = { version: VERSION, scan, open, button };
  const run = () => {
    scan();
    try {
      new MutationObserver((records) => {
        for (const r of records) r.addedNodes.forEach((n) => n.nodeType === 1 && scan(n as Element));
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch {
      // no MutationObserver: initial scan only
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
}

