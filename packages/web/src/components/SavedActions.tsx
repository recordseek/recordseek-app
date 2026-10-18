import { type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { clearLastService } from '../prefs';
import { BackButton } from './BackButton';
import { NewsletterInvite } from './NewsletterInvite';

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
  /** Where the newsletter invite was shown ("zotero", "geni"); the invite is skipped without it. */
  newsletterSource?: string;
}

/**
 * The follow-up panel after a destination saves, same look as FsComplete: confirmation,
 * view link(s), Go Back (edit and save again) and Save to Another Location (back to the
 * picker; the capture stays, because it lives in the provider and sessionStorage).
 */
export function SavedActions({ heading, title, links, children, onEdit, newsletterSource }: Props) {
  const navigate = useNavigate();
  function another(): void {
    clearLastService(); // so the picker doesn't jump straight back here
    navigate('/');
  }
  return (
    <main className="saved">
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
      {newsletterSource && <NewsletterInvite source={newsletterSource} />}
      <div className="form-footer">
        <BackButton onClick={onEdit} />
        <div className="footer-right">
          <button type="button" className="primary" onClick={another}>
            Save to Another Location
          </button>
        </div>
      </div>
      <p className="close-note">You may now close this window.</p>
    </main>
  );
}
