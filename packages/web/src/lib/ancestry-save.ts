export const ANCESTRY_ACTION = 'https://www.ancestry.com/savetoancestry/';
const ANCESTRY_ORIGIN = new URL(ANCESTRY_ACTION).origin;

export const ANCESTRY_FIELDS = [
  'sourceTitle', 'citationUrl', 'mediaUrl', 'citationTitle', 'mediaNote',
  'repositoryDomain', 'sourcePublisherName', 'sourcePublishedDate', 'sourcePublishedLocation',
] as const;
export type AncestryPayload = Record<(typeof ANCESTRY_FIELDS)[number], string>;
export type AncestrySaveStatus = 'waiting' | 'saved' | 'error' | 'closed';
export type AncestrySave = { dispose: () => void };

export function supportsAncestryPopup(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' &&
      (url.hostname === 'recordseek.com' || url.hostname.endsWith('.recordseek.com'));
  } catch {
    return false;
  }
}

/** Public Save to Ancestry opener protocol; Ancestry owns login and saving. */
export function startAncestrySave(
  payload: AncestryPayload,
  onStatus: (status: AncestrySaveStatus) => void,
): AncestrySave | null {
  if (!supportsAncestryPopup(window.location.origin)) return null;
  const messageOrigin = window.location.origin;
  const snapshot = { ...payload };
  let popup: Window | null = null;
  let disposed = false;
  function dispose(): void {
    disposed = true;
    window.removeEventListener('message', receive);
  }
  function finish(status: AncestrySaveStatus): void {
    dispose();
    onStatus(status);
  }
  function receive(event: MessageEvent): void {
    if (disposed || !popup || event.origin !== ANCESTRY_ORIGIN || event.source !== popup) return;
    if (event.data === 'readyForAncestryCitation') {
      try {
        popup.postMessage({ message: 'ancestryCitationDetails', messageOrigin, value: snapshot }, ANCESTRY_ORIGIN);
      } catch {
        finish('error');
      }
      return;
    }
    // reInitSaveToAncestry requires no reply. Keep listening for ready after sign-in.
    if (!event.data || typeof event.data !== 'object' || event.data.message !== 's2aCallback') return;
    switch (event.data.type) {
      case 'saveCitation': finish('saved'); break;
      case 'error': finish('error'); break;
      case 'close': finish('closed'); break;
    }
  }
  window.addEventListener('message', receive);
  try {
    // A fresh blank window lets us attach the listener before Ancestry loads.
    // The opener is required by Ancestry's protocol.
    popup = window.open('', '_blank', 'popup,width=760,height=800');
    if (!popup) {
      dispose();
      return null;
    }
    popup.location.href = ANCESTRY_ACTION;
  } catch {
    dispose();
    try { popup?.close(); } catch { /* The browser may already have detached it. */ }
    return null;
  }
  onStatus('waiting');
  return { dispose };
}
