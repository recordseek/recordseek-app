import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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
