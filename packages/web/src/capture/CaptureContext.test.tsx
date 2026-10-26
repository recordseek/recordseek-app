import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaptureProvider, useCapture, buildCapture, detectEntry, detectClient } from './CaptureContext';

function Probe() {
  const c = useCapture();
  return <div data-testid="probe">{`${c.publisher}::${c.title}::${c.domain}::${c.notes}`}</div>;
}

const WAVE_HREF =
  'http://localhost:9000/?_=1781620416094' +
  '&url=https%3A%2F%2Fnext.waveapps.com%2Fx%2Finvoices%2F1%2Fview' +
  '&title=Wave%20%E2%80%A2%20SimpleRain%2C%20Inc.%20%E2%80%A2%20Invoice%20Datafutures-24&notes=160.00';

describe('CaptureContext', () => {
  it('derives the capture from a localhost:9000 share URL via core', () => {
    render(
      <CaptureProvider href={WAVE_HREF}>
        <Probe />
      </CaptureProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe(
      'Wave::Wave • SimpleRain, Inc. • Invoice Datafutures-24::Next.waveapps.com::160.00',
    );
  });

  it('buildCapture handles an empty href', () => {
    expect(buildCapture('')).toEqual({
      url: '',
      title: '',
      publisher: '',
      domain: '',
      notes: '',
      accessedDate: expect.stringMatching(/\d{1,2} \w+ \d{4}/),
    });
  });

  it('uses the _ timestamp for the accessed date and falls back to h1 for the title', () => {
    const c = buildCapture('http://localhost:9000/?_=1781642252441&url=https%3A%2F%2Fdp.la%2F&h1=DPLA%20Heading');
    expect(c.title).toBe('DPLA Heading'); // no title param -> h1 fallback (legacy parity)
    expect(c.accessedDate).toMatch(/\d{1,2} \w+ \d{4}/);
  });

  it('restores the capture from sessionStorage when the URL has no capture (OAuth return)', () => {
    buildCapture('http://localhost:9000/?url=https%3A%2F%2Fdp.la%2F&title=DPLA');
    const restored = buildCapture('http://localhost:9000/?code=abc123');
    expect(restored.url).toBe('https://dp.la/');
    expect(restored.title).toBe('DPLA');
  });
});

describe('detectEntry', () => {
  const u = 'url=https%3A%2F%2Fx.com%2Fa';
  it('classifies sdk before extension/bookmarklet', () => {
    expect(detectEntry(`https://recordseek.com/share/?${u}&rs_src=sdk&rs_v=1.0.0`)).toBe('sdk');
    expect(detectEntry(`https://recordseek.com/share/?${u}&rs_src=sdk&e=chrome&ev=1`)).toBe('sdk');
  });
  it('keeps extension, bookmarklet and unknown', () => {
    expect(detectEntry(`https://recordseek.com/share/?${u}&e=chrome&ev=1`)).toBe('extension');
    expect(detectEntry(`https://recordseek.com/share/?${u}`)).toBe('bookmarklet');
    expect(detectEntry(`https://recordseek.com/share/?rs_src=sdk`)).toBe('unknown');
    expect(detectEntry(`https://recordseek.com/share/?${u}&rs_src=other`)).toBe('bookmarklet');
  });
});

describe('detectClient', () => {
  const u = 'url=https%3A%2F%2Fx.com%2Fa';
  it('names the browser extension and its version from e/ev', () => {
    expect(detectClient(`https://recordseek.com/share/?${u}&e=chrome&ev=2.4.0`)).toEqual({ type: 'chrome_extension', version: '2.4.0' });
    expect(detectClient(`https://recordseek.com/share/?${u}&e=firefox&ev=2.4.0`)).toEqual({ type: 'firefox_extension', version: '2.4.0' });
    expect(detectClient(`https://recordseek.com/share/?${u}&e=weirdbrowser&ev=9`)).toEqual({ type: 'extension', version: '9' });
  });

  it('names the native apps from the app= marker', () => {
    // The Safari extension ships as the Mac App Store app and sends app=safari + its version.
    expect(detectClient(`https://recordseek.com/share/?${u}&app=safari&e=safari&ev=1.2.0`)).toEqual({ type: 'safari_extension', version: '1.2.0' });
    // iOS sends app=ios with no version yet.
    expect(detectClient(`https://recordseek.com/share/?${u}&app=ios`)).toEqual({ type: 'ios_app', version: '' });
  });

  it('classifies sdk and bookmarklet, and empty without a capture', () => {
    expect(detectClient(`https://recordseek.com/share/?${u}&rs_src=sdk&e=chrome&ev=1`)).toEqual({ type: 'sdk', version: '' });
    expect(detectClient(`https://recordseek.com/share/?${u}`)).toEqual({ type: 'bookmarklet', version: '' });
    expect(detectClient(`https://recordseek.com/share/?rs_src=sdk`)).toEqual({ type: '', version: '' });
  });
});
