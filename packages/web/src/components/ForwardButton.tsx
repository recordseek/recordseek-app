import { type ReactNode } from 'react';

/** A navy primary button that moves the wizard forward, suffixed with a right arrow. */
export function ForwardButton({
  onClick,
  disabled,
  type = 'button',
  children = 'Next',
}: {
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  children?: ReactNode;
}) {
  return (
    <button type={type} className="primary btn-next" onClick={onClick} disabled={disabled}>
      {children}
      <svg
        className="next-arrow"
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
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </button>
  );
}
