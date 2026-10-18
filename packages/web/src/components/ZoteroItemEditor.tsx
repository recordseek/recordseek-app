import { useState } from 'react';
import { CITATION_STYLES, CITATION_STYLE_LABELS, type CitationStyle } from '@recordseek/core';
import {
  emptyCreator,
  MORE_FIELDS,
  ZOTERO_ITEM_TYPES,
  type ItemSchema,
  type ZoteroCreator,
  type ZoteroForm,
  type ZoteroItemType,
} from '../zoteroForm';

interface Props {
  form: ZoteroForm;
  schema: ItemSchema;
  errors: Record<string, string>;
  style: CitationStyle;
  onField: (name: string, value: string) => void;
  onType: (t: ZoteroItemType) => void;
  onCreators: (c: ZoteroCreator[]) => void;
  onPatch: (p: Partial<ZoteroForm>) => void;
  onStyle: (s: CitationStyle) => void;
}

const LONG = new Set(['abstractNote', 'extra']);

/** A Zotero info-pane style editor: label/value rows (stacked on narrow widths), creators, More fields, citation note. */
export function ZoteroItemEditor({ form, schema, errors, style, onField, onType, onCreators, onPatch, onStyle }: Props) {
  const [more, setMore] = useState(false);
  const rows = schema.fields.filter((f) => f.field !== 'title');
  const main = rows.filter((f) => !MORE_FIELDS.has(f.field));
  const extra = rows.filter((f) => MORE_FIELDS.has(f.field));
  const title = schema.fields.find((f) => f.field === 'title');

  function row(field: string, label: string) {
    const id = `zt-${field}`;
    const value = form.fields[field] ?? '';
    return (
      <div className="zt-row" key={field}>
        <label className="zt-label" htmlFor={id}>
          {label}
        </label>
        <div className="zt-value">
          {LONG.has(field) ? (
            <textarea id={id} rows={3} value={value} onChange={(e) => onField(field, e.target.value)} />
          ) : (
            <input
              id={id}
              type={field === 'accessDate' ? 'date' : 'text'}
              value={value}
              onChange={(e) => onField(field, e.target.value)}
              aria-invalid={errors[field] ? true : undefined}
            />
          )}
          {errors[field] && <span className="zt-error">{errors[field]}</span>}
        </div>
      </div>
    );
  }

  function setCreator(i: number, patch: Partial<ZoteroCreator>): void {
    onCreators(form.creators.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  return (
    <div className="zt-grid">
      <div className="zt-row">
        <label className="zt-label" htmlFor="zt-itemType">
          Item Type
        </label>
        <div className="zt-value">
          <select id="zt-itemType" value={form.itemType} onChange={(e) => onType(e.target.value as ZoteroItemType)}>
            {ZOTERO_ITEM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {title && row('title', title.label)}

      <div className="zt-row">
        <span className="zt-label">Creators</span>
        <div className="zt-value">
          {form.creators.map((c, i) => (
            <div className="zt-creator" key={i} role="group" aria-label={`Creator ${i + 1}`}>
              <select aria-label={`Creator ${i + 1} type`} value={c.creatorType} onChange={(e) => setCreator(i, { creatorType: e.target.value })}>
                {schema.creatorTypes.map((t) => (
                  <option key={t.creatorType} value={t.creatorType}>
                    {t.label}
                  </option>
                ))}
              </select>
              {c.single ? (
                <input aria-label={`Creator ${i + 1} name`} placeholder="Name" value={c.name} onChange={(e) => setCreator(i, { name: e.target.value })} />
              ) : (
                <>
                  <input aria-label={`Creator ${i + 1} last name`} placeholder="Last name" value={c.lastName} onChange={(e) => setCreator(i, { lastName: e.target.value })} />
                  <input aria-label={`Creator ${i + 1} first name`} placeholder="First name" value={c.firstName} onChange={(e) => setCreator(i, { firstName: e.target.value })} />
                </>
              )}
              <button type="button" className="link-button" onClick={() => setCreator(i, { single: !c.single })}>
                {c.single ? 'Two fields' : 'Single field'}
              </button>
              <button type="button" className="link-button" aria-label={`Remove creator ${i + 1}`} onClick={() => onCreators(form.creators.filter((_, j) => j !== i))}>
                Remove
              </button>
              {errors[`creator-${i}`] && <span className="zt-error">{errors[`creator-${i}`]}</span>}
            </div>
          ))}
          <button type="button" className="link-button" onClick={() => onCreators([...form.creators, emptyCreator(schema.creatorTypes[0]?.creatorType ?? 'author')])}>
            + Add creator
          </button>
        </div>
      </div>

      {main.map((f) => row(f.field, f.label))}

      {extra.length > 0 && (
        <>
          <button type="button" className="link-button zt-more" aria-expanded={more} onClick={() => setMore(!more)}>
            {more ? 'Hide more fields' : 'More fields'}
          </button>
          {more && extra.map((f) => row(f.field, f.label))}
        </>
      )}

      <div className="zt-row">
        <label className="zt-label" htmlFor="zt-tags">
          Tags
        </label>
        <div className="zt-value">
          <input id="zt-tags" placeholder="Comma-separated" value={form.tags} onChange={(e) => onPatch({ tags: e.target.value })} />
        </div>
      </div>

      <div className="zt-row">
        <div className="zt-label">
          <label htmlFor="zt-citation">Citation note</label>
          <select aria-label="Citation format" value={style} onChange={(e) => onStyle(e.target.value as CitationStyle)}>
            {CITATION_STYLES.map((s) => (
              <option key={s} value={s}>
                {CITATION_STYLE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="zt-value">
          <textarea id="zt-citation" rows={3} value={form.citation} onChange={(e) => onPatch({ citation: e.target.value })} />
        </div>
      </div>

      <div className="zt-row">
        <label className="zt-label" htmlFor="zt-notes">
          Notes
        </label>
        <div className="zt-value">
          <textarea id="zt-notes" rows={3} value={form.notes} onChange={(e) => onPatch({ notes: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
