import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node >= 25 ships a built-in `localStorage`/`sessionStorage` global that is
// `undefined` without --localstorage-file. It shadows jsdom's implementation
// (vitest skips globals that already exist), so re-point them at jsdom's.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (typeof globalThis[key] === 'undefined' && jsdomWindow?.[key]) {
    Object.defineProperty(globalThis, key, { value: jsdomWindow[key], configurable: true, writable: true });
  }
}

// We run vitest without `globals`, so Testing Library's automatic per-test
// cleanup isn't registered for us — do it explicitly to avoid DOM (and
// persisted prefs) leaking between tests.
afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});
