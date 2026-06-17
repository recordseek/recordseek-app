import { describe, it, expect } from 'vitest';
import { parseShareParams, buildShareUrl } from './share-params';

describe('buildShareUrl', () => {
  it('builds a capture URL, skipping empty values', () => {
    expect(
      buildShareUrl({ _: 123, url: 'https://x.com/r', title: 'A - B', citation: '', notes: undefined }),
    ).toBe('https://recordseek.com/share/?_=123&url=https%3A%2F%2Fx.com%2Fr&title=A%20-%20B');
  });

  it('returns the base when there are no values', () => {
    expect(buildShareUrl({ citation: '', notes: '' })).toBe('https://recordseek.com/share/');
  });

  it('round-trips with parseShareParams', () => {
    const url = buildShareUrl({ url: 'https://x.com', title: 'Hi there' });
    const parsed = parseShareParams(url);
    expect(parsed.url).toBe('https://x.com');
    expect(parsed.title).toBe('Hi there');
  });
});

describe('parseShareParams', () => {
  it('returns an empty object for falsy input', () => {
    expect(parseShareParams('')).toEqual({});
    expect(parseShareParams(null)).toEqual({});
    expect(parseShareParams(undefined)).toEqual({});
  });

  it('returns an empty object when there is no query string', () => {
    expect(parseShareParams('https://recordseek.com/share/')).toEqual({});
  });

  it('parses the recordseek self-capture example, stripping the hashbang and padding', () => {
    const url =
      'https://recordseek.com/share/?_=1781619125868&url=https%3A%2F%2Frecordseek.com%2F' +
      '&h1=%20%20%20%20RecordSeek%20%20%20%20&citation=&title=Citations%20Simplified%20-%20RecordSeek&notes=#!/fs-source';
    const p = parseShareParams(url);
    expect(p._).toBe('1781619125868');
    expect(p.url).toBe('https://recordseek.com/');
    expect(p.h1).toBe('RecordSeek'); // whitespace collapsed + trimmed
    expect(p.title).toBe('Citations Simplified - RecordSeek');
    expect(p.citation).toBeUndefined(); // empty value dropped
    expect(p.notes).toBeUndefined(); // empty value dropped
  });

  it('parses the Wave invoice capture served locally on :9000 (root, no /share/ prefix)', () => {
    const url =
      'http://localhost:9000/?_=1781620416094' +
      '&url=https%3A%2F%2Fnext.waveapps.com%2Fc6649ee8-2126-4073-93f2-c90cbd757590%2Finvoices%2F2155475081466295994%2Fview' +
      '&h1=Invoice%20%23DataFutures-24&citation=' +
      '&title=Wave%20%E2%80%A2%20SimpleRain%2C%20Inc.%20%E2%80%A2%20Invoice%20Datafutures-24&notes=160.00';
    const p = parseShareParams(url);
    expect(p.url).toBe(
      'https://next.waveapps.com/c6649ee8-2126-4073-93f2-c90cbd757590/invoices/2155475081466295994/view',
    );
    expect(p.h1).toBe('Invoice #DataFutures-24');
    expect(p.title).toBe('Wave • SimpleRain, Inc. • Invoice Datafutures-24');
    expect(p.notes).toBe('160.00');
  });

  it('strips a leaked #!/route tail from a value (OAuth code return)', () => {
    const p = parseShareParams('https://recordseek.com/share/?code=ABC123#!/fs-source');
    expect(p.code).toBe('ABC123');
  });

  it('handles &amp;-encoded separators', () => {
    const p = parseShareParams('https://x/?a=1&amp;b=2');
    expect(p.a).toBe('1');
    expect(p.b).toBe('2');
  });

  it('collects repeated keys into an array', () => {
    const p = parseShareParams('https://x/?tag=a&tag=b&tag=c');
    expect(p.tag).toEqual(['a', 'b', 'c']);
  });

  it('folds extra (non-default) params onto the captured url and keeps them as keys', () => {
    const p = parseShareParams('https://x/?url=https%3A%2F%2Fsite.com%2Frecord&pid=LZ12-345&givenName=John');
    expect(p.pid).toBe('LZ12-345');
    expect(typeof p.url).toBe('string');
    const url = p.url as string;
    expect(url.startsWith('https://site.com/record?')).toBe(true);
    expect(url).toContain('pid=LZ12-345');
    expect(url).toContain('givenName=John');
  });

  it('does not corrupt a value containing an encoded ampersand (fixes legacy double-decode/split bug)', () => {
    const p = parseShareParams('https://x/?title=Smith%20%26%20Jones&notes=ok');
    expect(p.title).toBe('Smith & Jones');
    expect(p.notes).toBe('ok');
  });

  it('does not throw on malformed percent-encoding', () => {
    expect(() => parseShareParams('https://x/?bad=%E0%A4%A&ok=fine')).not.toThrow();
    const p = parseShareParams('https://x/?bad=%zz&ok=fine');
    expect(p.ok).toBe('fine');
  });
});
