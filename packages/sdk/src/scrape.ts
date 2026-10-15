/**
 * Generic page scrape, mirroring the browser extension's content.js fallback
 * (find_tags / find_meta / RecordSeek()): works on any page, no genscrape.
 */

export interface PageScrape {
  url: string;
  title: string;
  citation: string;
  notes: string;
}

/** First meta[property=name] content (extension's find_meta), else ''. */
function meta(property: string): string {
  const metas = document.getElementsByTagName('meta');
  for (let i = 0; i < metas.length; i++) {
    const m = metas[i] as HTMLMetaElement;
    if (m.getAttribute('property') === property) return m.getAttribute('content') || '';
  }
  return '';
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * `selection` lets the caller pass text captured earlier (a click can clear the
 * live selection in some browsers).
 */
export function scrapePage(selection = ''): PageScrape {
  // citation: first <p> inside the first element with class "citation".
  const citationEl = document.querySelector('.citation');
  const citationP = citationEl ? citationEl.getElementsByTagName('p')[0] : undefined;
  const citation = citationP ? clean(citationP.textContent || '') : '';

  const h1El = document.getElementsByTagName('h1')[0];
  const h1 = h1El ? clean(h1El.textContent || '') : '';
  const docTitle = document.title || '';
  const title = h1 && h1.length > docTitle.length ? h1 : docTitle;

  let live = '';
  try {
    live = String(window.getSelection ? window.getSelection() : '');
  } catch {
    live = '';
  }
  const notes = clean(live || selection) || clean(meta('description') || meta('og:description'));

  return { url: window.location.href, title: clean(title), citation, notes };
}
