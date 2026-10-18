import { useCallback, useState } from 'react';
import { CITATION_STYLES, DEFAULT_CITATION_STYLE, type CitationStyle } from '@recordseek/core';

// Legacy localStorage/cookie keys, kept for continuity.
const CITATION_STYLE_KEY = 'recordseek_source_format';
const LAST_SERVICE_KEY = 'recordseek-last-service';
const SOURCE_BOX_KEY = 'recordseek-save-to-sourcebox';

export type Service = 'FamilySearch' | 'Ancestry' | 'Citation' | 'Zotero' | 'Geni' | 'WikiTree';

const SERVICES: readonly Service[] = ['FamilySearch', 'Ancestry', 'Citation', 'Zotero', 'Geni', 'WikiTree'];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function getSavedCitationStyle(): CitationStyle | null {
  const value = read(CITATION_STYLE_KEY);
  return value && (CITATION_STYLES as readonly string[]).includes(value) ? (value as CitationStyle) : null;
}

/** Citation style with cross-session persistence (legacy key recordseek_source_format). */
export function usePersistedCitationStyle(): [CitationStyle, (style: CitationStyle) => void] {
  const [style, setStyleState] = useState<CitationStyle>(() => getSavedCitationStyle() ?? DEFAULT_CITATION_STYLE);
  const setStyle = useCallback((next: CitationStyle) => {
    setStyleState(next);
    write(CITATION_STYLE_KEY, next);
  }, []);
  return [style, setStyle];
}

export function getLastService(): Service | null {
  const value = read(LAST_SERVICE_KEY);
  return (SERVICES as readonly (string | null)[]).includes(value) ? (value as Service) : null;
}
export function saveLastService(service: Service): void {
  write(LAST_SERVICE_KEY, service);
}
export function clearLastService(): void {
  remove(LAST_SERVICE_KEY);
}

/**
 * Whether to file new FamilySearch sources in the RecordSeek source-box folder
 * when attaching. Off unless the user ticks it (customers were surprised to find
 * sources filed automatically). Save-only sources are always filed.
 */
export function getSaveToSourceBox(): boolean {
  return read(SOURCE_BOX_KEY) === 'true';
}

export function usePersistedSaveToSourceBox(): [boolean, (save: boolean) => void] {
  const [save, setSaveState] = useState<boolean>(getSaveToSourceBox);
  const setSave = useCallback((next: boolean) => {
    setSaveState(next);
    write(SOURCE_BOX_KEY, String(next));
  }, []);
  return [save, setSave];
}
