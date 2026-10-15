/**
 * Bookmarklet entry (dist/bookmarklet.js, served at /sdk/v1/bookmarklet.js).
 *
 * The bookmark itself is a small loader (recordseek-site web/src/lib/bookmarklet.ts):
 * on click it opens a blank popup (only allowed during the click), records the
 * selection, and loads this file. If the page blocks the script or it is slow,
 * the loader opens /share/ with a basic scrape instead. This file claims the
 * click (so the loader's fallback stands down), runs genscrape on the page and
 * points the popup at /share/ with everything found.
 */
import { buildUrl } from './core';
import { parseData } from './keys';
import { genscrapeResult, initBase, runGenscrape } from './genscrape';

const SCRAPE_WAIT_MS = 2500;

export interface LoaderState {
  /** Popup the loader opened during the click; null when it was blocked. */
  win?: Window | null;
  /** Selection captured at click time (focus changes can clear it). */
  sel?: string;
  /** Set by whoever navigates the popup first: this file or the loader's fallback. */
  done?: number;
}

type Win = Window & { __recordseekBookmarklet?: LoaderState };

function go(state: LoaderState, url: string): void {
  const win = state.win;
  try {
    if (win && !win.closed) {
      win.location.href = url;
      win.focus();
      return;
    }
  } catch {
    // popup closed or no longer reachable
  }
  // No popup (blocked or closed): same fallback as the original bookmarklet.
  window.location.href = url;
}

export function runBookmarklet(): void {
  const w = window as Win;
  const state: LoaderState = w.__recordseekBookmarklet || {};
  if (state.done) return; // the loader's fallback already ran
  state.done = 1;
  try {
    start(state);
  } catch {
    state.done = 0; // let the loader's fallback take over
  }
}

function start(state: LoaderState): void {
  const cs = document.currentScript as HTMLScriptElement | null;
  initBase(cs && cs.src);
  const selection = state.sel || '';
  const parsed = parseData({});
  let sent = false;
  const finish = () => {
    if (sent) return;
    sent = true;
    go(state, buildUrl(parsed, genscrapeResult() ?? null, selection, 'bookmarklet'));
  };
  const timer = setTimeout(finish, SCRAPE_WAIT_MS);
  runGenscrape().then(() => {
    clearTimeout(timer);
    finish();
  }, finish);
}

try {
  // Only when loaded by the bookmark (which sets the state), not on a bare include.
  if ((window as Win).__recordseekBookmarklet) runBookmarklet();
} catch {
  // never throw into the page
}
