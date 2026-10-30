import { useState } from 'react';

const EDGE_ADDONS_URL = 'https://microsoftedge.microsoft.com/addons/detail/recordseek/caandekadjbeifokbkmhfphjhopoobcp';

// Bump the key when the message changes so everyone sees the new one.
const DISMISS_KEY = 'rs-announcement-edge-addons';

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
        <strong>RecordSeek is now on Microsoft Edge!</strong> Get it from{' '}
        <a href={EDGE_ADDONS_URL} target="_blank" rel="noreferrer">
          Microsoft Edge Add-ons
        </a>
        . Also available for Chrome and Firefox. Safari and mobile apps are coming soon.
      </span>
      <button type="button" className="announcement-close" aria-label="Dismiss" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
