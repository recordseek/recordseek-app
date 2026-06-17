import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaptureProvider, useCapture, buildCapture } from './CaptureContext';

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
