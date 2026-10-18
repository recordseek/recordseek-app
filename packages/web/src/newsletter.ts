import { accountHash } from './analytics';
import { getFsUserId, isFsAuthenticated } from './fsAuth';
import { getGeniId, getGeniToken } from './geni';
import { getZoteroLogin } from './zotero';

/** Public Cloud Run function; VITE_NEWSLETTER_URL overrides it. */
const DEFAULT_URL = 'https://us-central1-recordseek.cloudfunctions.net/newsletter';
const STATE_KEY = 'rs_newsletter';

export type NewsletterState = 'subscribed' | 'dismissed';

export function newsletterUrl(): string {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  return typeof env.VITE_NEWSLETTER_URL === 'string' && env.VITE_NEWSLETTER_URL
    ? env.VITE_NEWSLETTER_URL
    : DEFAULT_URL;
}

/** What this browser last did with the invite, or null. */
export function getNewsletterState(): NewsletterState | null {
  try {
    const v = localStorage.getItem(STATE_KEY);
    return v === 'subscribed' || v === 'dismissed' ? v : null;
  } catch {
    return null;
  }
}

export function setNewsletterState(state: NewsletterState): void {
  try {
    localStorage.setItem(STATE_KEY, state);
  } catch {
    /* storage unavailable */
  }
}

/** One-way hashes of every account signed in on this browser (never the ids themselves). */
export async function signedInAccountHashes(): Promise<string[]> {
  const hashes: string[] = [];
  try {
    const fsId = isFsAuthenticated() ? getFsUserId() : null;
    if (fsId) hashes.push(await accountHash('fs', fsId));
    const geniId = getGeniToken() ? getGeniId() : null;
    if (geniId) hashes.push(await accountHash('geni', geniId));
    const zoteroId = getZoteroLogin()?.userId;
    if (zoteroId) hashes.push(await accountHash('zotero', zoteroId));
  } catch {
    /* hashing unavailable: invite without accounts */
  }
  return [...new Set(hashes)];
}

async function post(action: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`${newsletterUrl()}?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Sign up an email; throws when the server refuses. */
export async function subscribe(email: string, accounts: string[], source: string, website = ''): Promise<void> {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const res = await post('subscribe', {
    email,
    accounts,
    source,
    release: typeof env.VITE_RELEASE === 'string' ? env.VITE_RELEASE : '',
    website,
  });
  if (!res.ok) throw new Error(`newsletter ${res.status}`);
}

/** Whether any of these accounts is already subscribed (false on any error). */
export async function isSubscribed(accounts: string[]): Promise<boolean> {
  if (accounts.length === 0) return false;
  try {
    const res = await post('status', { accounts });
    if (!res.ok) return false;
    const data = (await res.json()) as { subscribed?: boolean };
    return data.subscribed === true;
  } catch {
    return false;
  }
}
