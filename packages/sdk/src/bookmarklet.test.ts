import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runBookmarklet, type LoaderState } from './bookmarklet';
import { resetGenscrape } from './genscrape';

type Win = Window & { __recordseekBookmarklet?: LoaderState; genscrape?: unknown };

/** genscrape stub that reports no match, so the bookmarklet sends right away. */
function stubGenscrape(): void {
  const emitter = {
    on(event: string, cb: () => void) {
      if (event === 'noMatch') setTimeout(cb, 0);
      return emitter;
    },
  };
  (window as Win).genscrape = () => emitter;
}

beforeEach(() => {
  document.head.innerHTML = '<title>Page Title</title><meta property="description" content="A page">';
  document.body.innerHTML = '<h1>A much longer record heading</h1>';
  resetGenscrape();
  stubGenscrape();
});
afterEach(() => {
  delete (window as Win).__recordseekBookmarklet;
  delete (window as Win).genscrape;
  vi.restoreAllMocks();
});

const popup = () => ({ closed: false, focus: vi.fn(), location: { href: 'about:blank' } }) as unknown as Window;

describe('bookmarklet', () => {
  it('claims the click and points the loader popup at /share/', async () => {
    const win = popup();
    const state: LoaderState = { win, sel: 'picked text' };
    (window as Win).__recordseekBookmarklet = state;
    runBookmarklet();
    expect(state.done).toBe(1);
    await vi.waitFor(() => expect(win.location.href).not.toBe('about:blank'));
    const url = new URL(win.location.href);
    expect(url.origin + url.pathname).toBe('https://recordseek.com/share/');
    const p = Object.fromEntries(url.searchParams.entries());
    expect(p).toMatchObject({ title: 'A much longer record heading', notes: 'picked text', rs_src: 'bookmarklet' });
    expect(p['rs_host']).toBeUndefined();
    expect(p['rs_partner']).toBeUndefined();
  });

  it('stands down when the loader fallback already ran', () => {
    const win = popup();
    (window as Win).__recordseekBookmarklet = { win, done: 1 };
    runBookmarklet();
    expect(win.location.href).toBe('about:blank');
  });
});
