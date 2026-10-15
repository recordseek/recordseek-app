import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseData, canonicalKey, attributeDocs, PERSON_FIELDS } from './keys';
import { safeColor, STYLE_ID } from './render';
import { scrapePage } from './scrape';
import { buildUrl, scan, button, open, resolveUrl, VERSION } from './core';
import { resetGenscrape } from './genscrape';

const params = (url: string) => Object.fromEntries(new URL(url).searchParams.entries());

beforeEach(() => {
  document.head.innerHTML = '<title>Page Title</title>';
  document.body.innerHTML = '';
  resetGenscrape();
  vi.stubGlobal('CSS', { supports: (_p: string, v: string) => /^(red|black|#[0-9a-f]{3,6}|navy|white)$/i.test(v) });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('key normalization', () => {
  it('treats dashed, camel and lowercased names alike', () => {
    for (const k of ['firstName', 'firstname', 'first-name', 'first_name', 'first', 'given']) {
      expect(canonicalKey(k)).toBe('givenName');
    }
    expect(canonicalKey('lastName')).toBe('surname');
    expect(canonicalKey('sex')).toBe('gender');
    expect(canonicalKey('iconType')).toBe('iconType');
    expect(canonicalKey('icontype')).toBe('iconType');
    expect(canonicalKey('icon-type')).toBe('iconType');
  });

  it('maps every core person key and drops unknown keys', () => {
    for (const k of PERSON_FIELDS) expect(parseData({ [k.toLowerCase()]: 'x' }).share[k]).toBe('x');
    const p = parseData({ firstname: 'A', evil: 'x', e: 'chrome', h1: 'h', recordseek: '', rs_src: 'no', eventType: 'x' });
    expect(p.share).toEqual({ givenName: 'A' });
  });

  it('parses ui options with validation', () => {
    const p = parseData({
      size: 'lg',
      shape: 'bogus',
      label: 'Hi',
      bgcolor: 'red',
      iconType: 'white',
      iconPosition: 'end',
      partner: 'bad id!',
      scrape: 'false',
      class: 'a b',
      style: 'none',
    });
    expect(p.ui).toMatchObject({
      size: 'lg',
      shape: 'rounded',
      label: 'Hi',
      bgColor: 'red',
      iconType: 'white',
      iconPosition: 'end',
      className: 'a b',
      noStyle: true,
    });
    expect(p.partner).toBe('');
    expect(p.scrape).toBe(false);
    expect(parseData({}).ui).toMatchObject({ label: 'RecordSeek', iconType: 'color', iconPosition: 'start' });
  });

  it('documents every attribute from the same table', () => {
    const names = attributeDocs().map((a) => a.attribute);
    expect(names).toContain('data-birth-date');
    expect(names).toContain('data-icon-type');
    expect(attributeDocs().find((a) => a.key === 'givenName')?.aliases).toContain('first');
  });
});

describe('colors', () => {
  it('validates with CSS.supports', () => {
    expect(safeColor('red')).toBe('red');
    expect(safeColor('not-a-color')).toBeUndefined();
    expect(safeColor('red; background:url(x)')).toBeUndefined();
    expect(safeColor(undefined)).toBeUndefined();
  });
});

describe('url building', () => {
  it('resolves relative urls and falls back for non-http', () => {
    expect(resolveUrl('./')).toBe(new URL('./', window.location.href).href);
    expect(resolveUrl('javascript:alert(1)')).toBe(window.location.href);
    expect(resolveUrl('/a/b')).toBe(new URL('/a/b', window.location.href).href);
  });

  it('adds defaults, attribution and timestamp', () => {
    const u = buildUrl(parseData({ firstName: 'Dovy', partner: 'acme', unknownThing: 'x' }));
    expect(u.startsWith('https://recordseek.com/share/?')).toBe(true);
    const p = params(u);
    expect(p).toMatchObject({
      givenName: 'Dovy',
      title: 'Page Title',
      url: window.location.href,
      rs_src: 'sdk',
      rs_v: VERSION,
      rs_host: window.location.hostname,
      rs_partner: 'acme',
    });
    expect(Number(p._)).toBeGreaterThan(1e12);
    expect(p.unknownThing).toBeUndefined();
  });

  it('honors RecordSeekConfig.base', () => {
    (window as unknown as Record<string, unknown>).RecordSeekConfig = { base: 'http://localhost:9000/' };
    expect(buildUrl(parseData({})).startsWith('http://localhost:9000/?')).toBe(true);
    delete (window as unknown as Record<string, unknown>).RecordSeekConfig;
  });

  it('applies precedence: data-* > genscrape > page scrape', () => {
    document.head.innerHTML = '<title>T</title><meta property="og:description" content="Desc">';
    document.body.innerHTML = '<h1>A much longer heading</h1><div class="citation"><p>Cite me</p></div>';
    const p = params(buildUrl(parseData({ title: 'Mine' }), { title: 'GS', citation: 'GS cite', givenName: 'Gen' }));
    expect(p.title).toBe('Mine');
    expect(p.citation).toBe('GS cite');
    expect(p.givenName).toBe('Gen');
    expect(p.notes).toBe('Desc');
    const generic = params(buildUrl(parseData({})));
    expect(generic.title).toBe('A much longer heading');
    expect(generic.citation).toBe('Cite me');
  });

  it('data-scrape=false uses only data-* and defaults', () => {
    document.body.innerHTML = '<h1>A much longer heading</h1>';
    const p = params(buildUrl(parseData({ scrape: 'false' }), { givenName: 'Gen' }));
    expect(p.title).toBe('Page Title');
    expect(p.givenName).toBeUndefined();
    expect(p.notes).toBeUndefined();
  });

  it('scrapePage uses h1 only when longer than the title', () => {
    document.body.innerHTML = '<h1>Hi</h1>';
    expect(scrapePage().title).toBe('Page Title');
  });
});

describe('rendering and scan', () => {
  it('renders an accessible light-DOM button with default classes and one stylesheet', () => {
    document.body.innerHTML =
      '<div class="recordseek" data-first-name="A" data-bg-color="red" data-label="<b>x</b>" data-scrape="false"></div><div data-recordseek data-scrape="false"></div>';
    scan();
    const buttons = document.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    const b = buttons[0] as HTMLButtonElement;
    expect(b.type).toBe('button');
    expect(b.className).toBe('recordseek-button recordseek-button--md recordseek-button--rounded');
    expect(b.getAttribute('aria-label')).toBe('<b>x</b>');
    expect(b.querySelector('b')).toBeNull();
    expect(b.querySelector('svg.recordseek-button__icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(b.style.getPropertyValue('--recordseek-bg')).toBe('red');
    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);
    expect(document.getElementById(STYLE_ID)?.textContent).toContain(':where(.recordseek-button)');
  });

  it('scan is idempotent', () => {
    document.body.innerHTML = '<div class="recordseek" data-scrape="false"></div>';
    scan();
    const first = document.querySelector('button');
    scan();
    scan(document.body);
    expect(document.querySelectorAll('button').length).toBe(1);
    expect(document.querySelector('button')).toBe(first);
  });

  it('data-class replaces defaults; data-style=none skips the stylesheet; icon options', () => {
    document.body.innerHTML =
      '<div class="recordseek" data-class="my-btn x" data-style="none" data-icon-type="none" data-scrape="false"></div>';
    scan();
    const b = document.querySelector('button') as HTMLButtonElement;
    expect(b.className).toBe('my-btn x');
    expect(b.querySelector('svg')).toBeNull();
    expect(document.getElementById(STYLE_ID)).toBeNull();
  });

  it('puts the icon at the end and supports the white mark', () => {
    document.body.innerHTML = '<div id="a" data-icon-type="white" data-icon-position="end" data-scrape="false"></div>';
    button(document.getElementById('a') as Element);
    const b = document.querySelector('button') as HTMLButtonElement;
    expect(b.lastElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(b.innerHTML).not.toContain('#1e4078');
    expect(b.innerHTML).not.toContain('#23b99a');
  });

  it('opens a popup with the share url on click, falling back to a new tab', () => {
    document.body.innerHTML = '<div class="recordseek" data-given-name="Jane" data-scrape="false"></div>';
    scan();
    const spy = vi.spyOn(window, 'open').mockReturnValue(null);
    (document.querySelector('button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledTimes(2);
    const [url, target, features] = spy.mock.calls[0] as [string, string, string];
    expect(target).toBe('recordseek');
    expect(features).toContain('width=800,height=620');
    expect(params(url).givenName).toBe('Jane');
    expect(spy.mock.calls[1]?.[1]).toBe('_blank');
  });

  it('open(data) never throws', () => {
    vi.spyOn(window, 'open').mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => open({ givenName: 'A', scrape: false })).not.toThrow();
  });
});
