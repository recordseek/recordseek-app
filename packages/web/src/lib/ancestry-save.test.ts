import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANCESTRY_ACTION, startAncestrySave, supportsAncestryPopup, type AncestryPayload, type AncestrySave } from './ancestry-save';

const payload: AncestryPayload = {
  sourceTitle: 'Edited title', citationUrl: 'https://example.org/record', mediaUrl: '',
  citationTitle: 'Edited citation', mediaNote: 'User notes', repositoryDomain: 'example.org',
  sourcePublisherName: 'Archive', sourcePublishedDate: '', sourcePublishedLocation: '',
};
let popup: Window;
let post: ReturnType<typeof vi.fn>;
let active: AncestrySave | null;
function message(data: unknown, origin = 'https://www.ancestry.com', source: Window | null = popup) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}
beforeEach(() => {
  vi.stubGlobal('location', new URL('https://recordseek.com'));
  post = vi.fn();
  popup = { location: { href: '' }, postMessage: post, close: vi.fn() } as unknown as Window;
  vi.spyOn(window, 'open').mockReturnValue(popup);
  active = null;
});
afterEach(() => {
  active?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Ancestry popup handoff', () => {
  it('uses only HTTPS RecordSeek origins', () => {
    expect(supportsAncestryPopup('https://recordseek.com')).toBe(true);
    expect(supportsAncestryPopup('https://preview.recordseek.com')).toBe(true);
    for (const origin of ['http://recordseek.com', 'http://localhost:9000', 'https://recordseek.com.evil.test', 'https://evilrecordseek.com', 'invalid']) {
      expect(supportsAncestryPopup(origin)).toBe(false);
    }
    vi.stubGlobal('location', new URL('http://localhost:9000'));
    expect(startAncestrySave(payload, vi.fn())).toBeNull();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('sends the submitted snapshot only to the authentic ready popup', () => {
    const status = vi.fn();
    const submitted = { ...payload };
    active = startAncestrySave(submitted, status);
    submitted.sourceTitle = 'Later edits';
    expect(popup.location.href).toBe(ANCESTRY_ACTION);
    expect(status).toHaveBeenCalledWith('waiting');
    message('readyForAncestryCitation', 'https://attacker.test');
    message('readyForAncestryCitation', undefined, window);
    for (const data of [null, {}, 'unrelated', { message: 'readyForAncestryCitation' }]) message(data);
    expect(post).not.toHaveBeenCalled();
    message('readyForAncestryCitation');
    expect(post).toHaveBeenCalledExactlyOnceWith({
      message: 'ancestryCitationDetails', messageOrigin: 'https://recordseek.com', value: payload,
    }, 'https://www.ancestry.com');
    message('reInitSaveToAncestry');
    expect(post).toHaveBeenCalledTimes(1);
    message('readyForAncestryCitation');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('confirms a save only after an authentic saveCitation callback and removes its listener', () => {
    const status = vi.fn();
    active = startAncestrySave(payload, status);
    const saved = { message: 's2aCallback', type: 'saveCitation' };
    message(saved, 'https://attacker.test');
    message(saved, undefined, window);
    message({ message: 's2aCallback', type: 'saveEvent' });
    message({ message: 's2aCallback', type: 'init' });
    expect(status.mock.calls).toEqual([['waiting']]);
    message(saved);
    expect(status.mock.calls).toEqual([['waiting'], ['saved']]);
    message('readyForAncestryCitation');
    message(saved);
    expect(post).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledTimes(2);
  });

  it.each(['error', 'close'] as const)('cleans up on the %s callback without claiming success', (type) => {
    const status = vi.fn();
    active = startAncestrySave(payload, status);
    message({ message: 's2aCallback', type });
    expect(status).toHaveBeenLastCalledWith(type === 'close' ? 'closed' : 'error');
    message('readyForAncestryCitation');
    expect(post).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalledWith('saved');
  });

  it('allows disposal before a retry or unmount', () => {
    active = startAncestrySave(payload, vi.fn());
    active?.dispose();
    const newer = { ...popup, postMessage: vi.fn(), location: { href: '' } } as unknown as Window;
    vi.mocked(window.open).mockReturnValue(newer);
    active = startAncestrySave(payload, vi.fn());
    message('readyForAncestryCitation');
    expect(post).not.toHaveBeenCalled();
    message('readyForAncestryCitation', undefined, newer);
    expect(newer.postMessage).toHaveBeenCalledTimes(1);
    active?.dispose();
    message('readyForAncestryCitation', undefined, newer);
    expect(newer.postMessage).toHaveBeenCalledTimes(1);
  });

  it('falls back without a listener when the popup is blocked or opening throws', () => {
    const status = vi.fn();
    vi.mocked(window.open).mockReturnValue(null);
    expect(startAncestrySave(payload, status)).toBeNull();
    vi.mocked(window.open).mockImplementation(() => { throw new Error('blocked'); });
    expect(startAncestrySave(payload, status)).toBeNull();
    message('readyForAncestryCitation');
    expect(post).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('reports a failed message delivery and removes its listener', () => {
    const status = vi.fn();
    post.mockImplementation(() => { throw new Error('closed'); });
    active = startAncestrySave(payload, status);
    message('readyForAncestryCitation');
    expect(status).toHaveBeenLastCalledWith('error');
    message('readyForAncestryCitation');
    expect(post).toHaveBeenCalledTimes(1);
  });
});
