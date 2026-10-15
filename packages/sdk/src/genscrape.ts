/**
 * Lazy genscrape loader. genscrape (a separate dist/genscrape.js, kept out of
 * recordseek.js) recognizes specific genealogy sites and returns GEDCOM X; core
 * maps it to share params. Runs at most once per page and caches the result.
 */
import { genscrapeToShareParams, type GenscrapeShareParams } from '@recordseek/core/genscrape-map';

const FALLBACK_BASE = 'https://recordseek.com/sdk/v1/';
const LOAD_TIMEOUT_MS = 15000;

type Result = GenscrapeShareParams | null;

interface Emitter {
  on(event: string, cb: (data?: unknown) => void): Emitter;
}

let base = FALLBACK_BASE;
let result: Result | undefined;
let promise: Promise<Result> | undefined;

/** Directory recordseek.js was loaded from; call once at startup (currentScript is only set then). */
export function initBase(scriptSrc: string | undefined | null, override?: string): void {
  if (override) {
    base = override.replace(/\/?$/, '/');
    return;
  }
  try {
    if (scriptSrc) base = new URL('./', scriptSrc).href;
  } catch {
    base = FALLBACK_BASE;
  }
}

export function getBase(): string {
  return base;
}

/** Cached result: undefined = not finished yet, null = nothing found / failed. */
export function genscrapeResult(): Result | undefined {
  return result;
}

/** Start (once) and resolve with the mapped result; never rejects. */
export function runGenscrape(): Promise<Result> {
  if (promise) return promise;
  promise = new Promise<Result>((resolve) => {
    let settled = false;
    const finish = (value: Result) => {
      if (settled) return;
      settled = true;
      result = value && Object.keys(value).length > 0 ? value : null;
      resolve(result);
    };
    try {
      setTimeout(() => finish(null), LOAD_TIMEOUT_MS);
      const start = () => {
        try {
          const gs = (window as unknown as { genscrape?: () => Emitter }).genscrape;
          if (typeof gs !== 'function') return finish(null);
          gs()
            .on('data', (data) => {
              try {
                finish(genscrapeToShareParams(data));
              } catch {
                finish(null);
              }
            })
            .on('noMatch', () => finish(null))
            .on('noData', () => finish(null))
            .on('error', () => finish(null));
        } catch {
          finish(null);
        }
      };
      if (typeof (window as unknown as { genscrape?: unknown }).genscrape === 'function') {
        start();
      } else {
        const script = document.createElement('script');
        script.src = base + 'genscrape.js';
        script.async = true;
        script.onload = start;
        script.onerror = () => finish(null);
        (document.head || document.documentElement).appendChild(script);
      }
    } catch {
      finish(null);
    }
  });
  return promise;
}

/** Run on idle so it never competes with the partner page's own work. */
export function preloadGenscrape(): void {
  const go = () => void runGenscrape();
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (typeof ric === 'function') ric(go);
  else setTimeout(go, 200);
}

/** Test hook. */
export function resetGenscrape(): void {
  result = undefined;
  promise = undefined;
  base = FALLBACK_BASE;
}
