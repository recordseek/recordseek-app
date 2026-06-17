import { type ReactNode } from 'react';

/** A secondary button that navigates backward, prefixed with a left-arrow icon. */
export function BackButton({ onClick, children = 'Go Back' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button type="button" className="btn-back" onClick={onClick}>
      <svg
        className="back-arrow"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      {children}
    </button>
  );
}
