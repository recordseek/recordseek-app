import type { ZoteroItem } from './zotero';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local-time YYYY-MM-DD. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The capture's accessedDate ("18 October 2026", built by CaptureContext) as YYYY-MM-DD.
 * Parsed by hand: Date.parse on a locale-style string is engine-defined. Today when unreadable.
 */
export function accessedIso(human: string, today: Date = new Date()): string {
  const m = /^\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*$/.exec(human);
  const month = m ? MONTHS.findIndex((n) => n.startsWith(m[2]!.toLowerCase().slice(0, 3))) : -1;
  if (!m || month < 0) return isoDate(today);
  const day = Number(m[1]);
  const year = Number(m[3]);
  const d = new Date(year, month, day);
  return d.getMonth() === month && d.getDate() === day ? `${year}-${pad(month + 1)}-${pad(day)}` : isoDate(today);
}

export interface ZoteroForm {
  title: string;
  url: string;
  /** Becomes websiteTitle. */
  publisher: string;
  /** YYYY-MM-DD */
  accessed: string;
  collectionKey?: string;
  tags?: string[];
}

/** Problems that would stop a save, by field name. */
export function validateZoteroForm(form: ZoteroForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) errors.title = 'A title is required.';
  const url = form.url.trim();
  if (url) {
    try {
      new URL(url);
    } catch {
      errors.url = 'Enter a full URL, like https://example.com/page.';
    }
  }
  return errors;
}

/** The webpage item to POST; only fields a Zotero webpage accepts. */
export function buildZoteroItem(form: ZoteroForm, key?: string): ZoteroItem {
  const item: ZoteroItem = { itemType: 'webpage', title: form.title.trim() };
  if (form.url.trim()) item.url = form.url.trim();
  if (form.publisher.trim()) item.websiteTitle = form.publisher.trim();
  if (form.accessed) item.accessDate = `${form.accessed}T00:00:00Z`;
  item.creators = [];
  item.tags = (form.tags ?? []).map((tag) => ({ tag }));
  item.collections = form.collectionKey ? [form.collectionKey] : [];
  // Zotero refuses a client-keyed write without a version; 0 means "new item".
  if (key) {
    item.key = key;
    item.version = 0;
  }
  return item;
}
