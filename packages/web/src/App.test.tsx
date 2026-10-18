import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { App } from './App';

const DPLA_CAPTURE =
  '/?_=1781642252441&url=https%3A%2F%2Fdp.la%2F&h1=Digital%20Public%20Library%20of%20America' +
  '&citation=&title=Digital%20Public%20Library%20of%20America' +
  '&notes=The%20Digital%20Public%20Library%20of%20America%20brings%20together%20the%20riches.';

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('App with an extension capture URL', () => {
  it('loads a bare capture URL (no hash) and shows the captured source', () => {
    window.history.replaceState({}, '', DPLA_CAPTURE);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Create a Source' })).toBeInTheDocument();
    expect(screen.getByText('Digital Public Library of America')).toBeInTheDocument();
  });
});

describe('hidden destinations', () => {
  it('redirects /geni to the home screen without dev mode', () => {
    window.history.replaceState({}, '', DPLA_CAPTURE + '#/geni');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Create a Source' })).toBeInTheDocument();
  });

  it.each(['geni-search', 'geni-results', 'geni-attach', 'geni-complete'])('redirects /%s to the home screen without dev mode', (route) => {
    window.history.replaceState({}, '', DPLA_CAPTURE + '#/' + route);
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Create a Source' })).toBeInTheDocument();
  });

  it('opens /geni with dev mode', () => {
    window.history.replaceState({}, '', DPLA_CAPTURE + '&dev=1#/geni');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Save to Geni' })).toBeInTheDocument();
  });
});
