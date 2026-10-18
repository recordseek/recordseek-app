import { type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { clearLastService } from '../prefs';
import { BackButton } from './BackButton';

export interface SavedLink {
  href: string;
  label: string;
}

interface Props {
  /** The confirmation line, like "Saved to Zotero." */
  heading: string;
  /** The captured source title, shown quoted under the heading. */
  title?: string;
  /** "View in Zotero" style links; open in a new tab. */
  links: SavedLink[];
  /** Extra explanatory content (warnings and so on). */
  children?: ReactNode;
  /** "Go Back": return to the editable form to change something and save again. */
  onEdit: () => void;
}

/**
 * The follow-up panel after a destination saves, same look as FsComplete: confirmation,
 * view link(s), Go Back (edit and save again) and Save to Another Location (back to the
 * picker; the capture stays, because it lives in the provider and sessionStorage).
 */
export function SavedActions({ heading, title, links, children, onEdit }: Props) {
  const navigate = useNavigate();
  function another(): void {
    clearLastService(); // so the picker doesn't jump straight back here
    navigate('/');
  }
  return (
    <main>
      <h3>{heading}</h3>
      {title && <p>“{title}”</p>}
      {children}
      {links.map((l) => (
        <p key={l.href}>
          <a href={l.href} target="_blank" rel="noreferrer">
            {l.label}
          </a>
        </p>
      ))}
      <button type="button" onClick={another}>
        Save to Another Location
      </button>
      <div className="form-footer">
        <BackButton onClick={onEdit} />
      </div>
      <p>You may now close this window.</p>
    </main>
  );
}
