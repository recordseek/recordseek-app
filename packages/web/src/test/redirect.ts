import { vi, type Mock } from 'vitest';

/** Replaces window.location with a copy whose assign() is a spy (jsdom can't navigate). Undo with vi.unstubAllGlobals(). */
export function stubRedirect(): Mock<(url: string) => void> {
  const assign = vi.fn<(url: string) => void>();
  vi.stubGlobal('location', { ...window.location, href: window.location.href, assign });
  return assign;
}
