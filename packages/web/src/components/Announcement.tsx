import { useState } from 'react';

// Bump the key when the message changes so everyone sees the new one.
const DISMISS_KEY = 'rs-announcement-chrome-back';

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
        <strong>RecordSeek is back on Chrome!</strong> Coming soon to Safari, Edge and mobile.
      </span>
      <button type="button" className="announcement-close" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
