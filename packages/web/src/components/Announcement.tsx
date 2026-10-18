import { useState } from 'react';

// Bump the key when the message changes so everyone sees the new one.
const DISMISS_KEY = 'rs-announcement-browsers-back';

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** A one-line, dismissible news strip above the header. */
export function Announcement() {
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;

  function dismiss(): void {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable: hide for this visit only */
    }
    setHidden(true);
  }

  return (
    <div className="announcement" role="status">
      <span>
        <strong>RecordSeek is back on Chrome, Edge, Firefox and more!</strong> Safari and mobile apps are coming
        soon.{' '}
        <a href="https://recordseek.com/" target="_blank" rel="noreferrer">
          See our new website
        </a>
      </span>
      <button type="button" className="announcement-close" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
