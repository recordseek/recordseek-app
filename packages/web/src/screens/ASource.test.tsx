import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { CITATION_STYLES } from '@recordseek/core';
import { CaptureProvider } from '../capture/CaptureContext';
import { ASource } from './ASource';

const HREF =
  'http://localhost:9000/?url=https%3A%2F%2Fwww.ancestry.com%2Frecord%2F1&title=Jane%20Doe%20-%20Ancestry.com&notes=a%20note';

function renderASource() {
  return render(
    <MemoryRouter>
      <CaptureProvider href={HREF}>
        <ASource />
      </CaptureProvider>
    </MemoryRouter>,
  );
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('ASource', () => {
  it('natively posts the capture to Ancestry', () => {
    renderASource();
    const form = document.querySelector('form');
    expect(form?.getAttribute('action')).toBe('https://www.ancestry.com/savetoancestry/');
    expect(form?.getAttribute('method')?.toLowerCase()).toBe('post');
    expect((document.querySelector('input[name="sourceTitle"]') as HTMLInputElement).value).toBe('Jane Doe');
    expect((document.querySelector('input[name="citationUrl"]') as HTMLInputElement).value).toContain(
      'ancestry.com/record/1',
    );
    expect((document.querySelector('input[name="repositoryDomain"]') as HTMLInputElement).value).toBe('Ancestry.com');
  });

  it('offers every citation style and regenerates the citation on change', async () => {
    renderASource();
    expect(screen.getAllByRole('option')).toHaveLength(CITATION_STYLES.length);
    const citation = document.querySelector('textarea[name="citationTitle"]') as HTMLTextAreaElement;
    const before = citation.value;
    await userEvent.selectOptions(screen.getByLabelText('Citation format'), 'mla');
    expect(citation.value).not.toBe(before);
    expect(citation.value).toContain('"Jane Doe."');
  });

  it('hands edited fields to the popup and confirms its save callback', async () => {
    vi.stubGlobal('location', new URL('https://recordseek.com'));
    const postMessage = vi.fn();
    const popup = { location: { href: '' }, postMessage } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    renderASource();
    const title = document.querySelector('input[name="sourceTitle"]') as HTMLInputElement;
    await userEvent.clear(title);
    await userEvent.type(title, 'Reviewed title');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('status')).toHaveTextContent('Continue in the Ancestry window');
    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://www.ancestry.com', source: popup, data: 'readyForAncestryCitation',
    })));
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      value: expect.objectContaining({ sourceTitle: 'Reviewed title', mediaNote: 'a note' }),
    }), 'https://www.ancestry.com');
    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://www.ancestry.com', source: popup,
      data: { message: 's2aCallback', type: 'saveCitation' },
    })));
    expect(screen.getByRole('status')).toHaveTextContent('Ancestry confirmed');
    expect(screen.queryByRole('button', { name: 'Continue in this tab' })).toBeNull();
  });

  it('lets the user submit the native fallback and disposes the popup listener', async () => {
    vi.stubGlobal('location', new URL('https://recordseek.com'));
    const popup = { location: { href: '' }, postMessage: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    renderASource();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    let wasPrevented: boolean | undefined;
    // Observe React's decision, then suppress jsdom's unimplemented native navigation.
    window.addEventListener('submit', (event) => {
      wasPrevented = event.defaultPrevented;
      event.preventDefault();
    }, { once: true });
    await userEvent.click(screen.getByRole('button', { name: 'Continue in this tab' }));
    expect(wasPrevented).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    act(() => window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://www.ancestry.com', source: popup, data: 'readyForAncestryCitation',
    })));
    expect(popup.postMessage).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('removes the pending popup listener when the screen unmounts', async () => {
    vi.stubGlobal('location', new URL('https://recordseek.com'));
    const popup = { location: { href: '' }, postMessage: vi.fn() } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const view = renderASource();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    view.unmount();
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://www.ancestry.com', source: popup, data: 'readyForAncestryCitation',
    }));
    expect(popup.postMessage).not.toHaveBeenCalled();
  });

});
