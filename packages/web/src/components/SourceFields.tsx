import { useState } from 'react';
import { CITATION_STYLES, CITATION_STYLE_LABELS, type CitationStyle } from '@recordseek/core';
import type { Capture } from '../capture/CaptureContext';
import { captureCitation } from '../citationText';
import { usePersistedCitationStyle } from '../prefs';

export interface SourceFieldValues {
  title: string;
  url: string;
  citation: string;
  notes: string;
}

/** Editable source form state seeded from the capture; the citation regenerates on title, URL or style change. */
export function useSourceFields(capture: Capture) {
  const [style, setStyleState] = usePersistedCitationStyle();
  const [values, setValues] = useState<SourceFieldValues>(() => ({
    title: capture.title,
    url: capture.url,
    citation: captureCitation(capture, style),
    notes: capture.notes,
  }));

  function regenerate(title: string, url: string, next: CitationStyle): string {
    return captureCitation({ ...capture, title, url }, next);
  }

  function onChange(patch: Partial<SourceFieldValues>): void {
    setValues((prev) => {
      const merged = { ...prev, ...patch };
      // A patch that sets the citation itself (restoring earlier edits) keeps it as given.
      const rebuild = (patch.title !== undefined || patch.url !== undefined) && patch.citation === undefined;
      return rebuild ? { ...merged, citation: regenerate(merged.title, merged.url, style) } : merged;
    });
  }

  function setStyle(next: CitationStyle): void {
    setStyleState(next);
    setValues((prev) => ({ ...prev, citation: regenerate(prev.title, prev.url, next) }));
  }

  return { values, style, onChange, setStyle };
}

interface Props {
  values: SourceFieldValues;
  style: CitationStyle;
  onChange: (patch: Partial<SourceFieldValues>) => void;
  onStyleChange: (style: CitationStyle) => void;
  /** Prefix for element ids, so several forms never collide. */
  idPrefix?: string;
  /** False leaves out the notes field (Save Citation has none). */
  showNotes?: boolean;
}

/** Title, URL, citation (with format select) and notes: the same fields and classes as the FamilySearch source screen. */
export function SourceFields({ values, style, onChange, onStyleChange, idPrefix = 'source', showNotes = true }: Props) {
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-title`}>
          Source Title
        </label>
        <input id={`${idPrefix}-title`} value={values.title} onChange={(e) => onChange({ title: e.target.value })} required />
      </div>

      <div className="field">
        <label className="field-label" htmlFor={`${idPrefix}-url`}>
          Source <span className="field-hint">(URL)</span>
        </label>
        <input id={`${idPrefix}-url`} value={values.url} onChange={(e) => onChange({ url: e.target.value })} required />
      </div>

      <div className="field">
        <div className="citation-label-row">
          <label className="field-label" htmlFor={`${idPrefix}-citation`}>
            Where the Record Is Found <span className="field-hint">(Citation)</span>
          </label>
          <span className="format-inline">
            <span className="field-hint">Format</span>
            <select aria-label="Citation format" value={style} onChange={(e) => onStyleChange(e.target.value as CitationStyle)}>
              {CITATION_STYLES.map((s) => (
                <option key={s} value={s}>
                  {CITATION_STYLE_LABELS[s]}
                </option>
              ))}
            </select>
          </span>
        </div>
        <textarea
          id={`${idPrefix}-citation`}
          aria-label="Citation"
          value={values.citation}
          onChange={(e) => onChange({ citation: e.target.value })}
          rows={3}
        />
      </div>

      {showNotes && (
        <div className="field">
          <label className="field-label" htmlFor={`${idPrefix}-notes`}>
            Describe the Record <span className="field-hint">(Notes)</span>
          </label>
          <textarea
            id={`${idPrefix}-notes`}
            value={values.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={3}
          />
        </div>
      )}
    </>
  );
}
