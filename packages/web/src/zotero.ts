/** Public Cloud Run function (OAuth helper and Geni relay); VITE_ZOTERO_AUTH_URL overrides it. */
const DEFAULT_AUTH_URL = 'https://us-central1-recordseek.cloudfunctions.net/zotero-auth';
const API = 'https://api.zotero.org';
const STORE_KEY = 'rs_zotero';

export function zoteroAuthUrl(): string {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  return typeof env.VITE_ZOTERO_AUTH_URL === 'string' && env.VITE_ZOTERO_AUTH_URL
    ? env.VITE_ZOTERO_AUTH_URL
    : DEFAULT_AUTH_URL;
}

/** What the OAuth round-trip leaves behind. The key is the user's Zotero API key. */
export interface ZoteroLogin {
  key: string;
  userId: string;
  username: string;
}

export function getZoteroLogin(): ZoteroLogin | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Partial<ZoteroLogin> | null;
    return parsed && parsed.key && parsed.userId
      ? {
          key: parsed.key,
          userId: parsed.userId,
          username: parsed.username ?? '',
        }
      : null;
  } catch {
    return null;
  }
}

export function clearZoteroLogin(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Where the helper function starts the OAuth dance; it sends the user back to `returnTo`. */
/**
 * Deletes the API key the OAuth round-trip created (documented: DELETE /keys/<key>,
 * "generally done only by a client that created the key originally using OAuth").
 * api.zotero.org allows this cross-origin with the Zotero-API-Key header.
 */
export async function revokeZoteroKey(login: ZoteroLogin, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(`https://api.zotero.org/keys/${encodeURIComponent(login.key)}`, {
    method: 'DELETE',
    headers: { 'Zotero-API-Key': login.key },
    signal: AbortSignal.timeout(5000),
  });
}

export function zoteroStartUrl(returnTo: string): string {
  return `${zoteroAuthUrl()}?${new URLSearchParams({ action: 'start', return: returnTo })}`;
}

export interface ZoteroCollection {
  key: string;
  name: string;
}

export class ZoteroError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function headers(login: ZoteroLogin, extra?: Record<string, string>): Record<string, string> {
  return { 'Zotero-API-Key': login.key, 'Zotero-API-Version': '3', ...extra };
}

export async function listCollections(
  login: ZoteroLogin,
  fetchImpl: typeof fetch = fetch,
): Promise<ZoteroCollection[]> {
  const res = await fetchImpl(`${API}/users/${encodeURIComponent(login.userId)}/collections?limit=100`, {
    headers: headers(login),
  });
  if (!res.ok) throw new ZoteroError(`Zotero collections ${res.status}`, res.status);
  const rows = (await res.json()) as Array<{
    key: string;
    data?: { name?: string };
  }>;
  return rows.map((r) => ({ key: r.key, name: r.data?.name ?? r.key })).sort((a, b) => a.name.localeCompare(b.name));
}

export type ZoteroItem = Record<string, unknown> & { itemType: string };

const escapeHtml = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The child note: citation then notes, as HTML paragraphs. */
export function buildZoteroNote(parentKey: string, citation: string, notes: string): ZoteroItem {
  const paras = [citation, notes].filter((t) => t.trim()).map((t) => `<p>${escapeHtml(t).replace(/\n/g, '<br/>')}</p>`);
  return { itemType: 'note', parentItem: parentKey, note: paras.join('') };
}

const KEY_CHARS = '23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';

/** A client-generated 8-character item key, so the child note can name its parent in the same request. */
export function newItemKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => KEY_CHARS[b % KEY_CHARS.length]).join('');
}

/** A fresh idempotency token: re-sending the same one never creates a duplicate item. */
export function newWriteToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CreatedItem {
  key: string;
  version: number;
}

export async function createItem(
  login: ZoteroLogin,
  items: ZoteroItem[],
  writeToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedItem> {
  const res = await fetchImpl(`${API}/users/${encodeURIComponent(login.userId)}/items`, {
    method: 'POST',
    headers: headers(login, {
      'Content-Type': 'application/json',
      'Zotero-Write-Token': writeToken,
    }),
    body: JSON.stringify(items),
  });
  if (!res.ok) throw new ZoteroError(`Zotero save ${res.status}`, res.status);
  const body = (await res.json()) as {
    successful?: Record<string, { key: string; version: number }>;
    failed?: Record<string, { message?: string }>;
  };
  const made = body.successful?.['0'];
  if (!made) throw new ZoteroError(body.failed?.['0']?.message ?? 'Zotero rejected the item', 400);
  return { key: made.key, version: made.version };
}

export function zoteroItemUrl(username: string, itemKey: string): string {
  return `https://www.zotero.org/${encodeURIComponent(username)}/items/${itemKey}`;
}
