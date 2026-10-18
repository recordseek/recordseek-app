import { useEffect, useRef, useState } from 'react';
import { useSession, EVENT_TAGS, type EventTag } from '../session/SessionContext';

export const TAG_LABELS: Record<EventTag, string> = {
  name: 'Name',
  gender: 'Gender',
  birth: 'Birth',
  christening: 'Christening',
  death: 'Death',
  burial: 'Burial',
};

const MOBILE_QUERY = '(max-width: 768px)';

/** Track the mobile breakpoint; safe when matchMedia is absent (jsdom/tests). */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = (): void => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

/**
 * "Tag this Source to Events" — the green pill button (with a live count) that
 * opens the event checkboxes, restoring the legacy popover feel. On mobile it
 * uses the platform's native <dialog> popup; on desktop, a centered modal. The
 * checkboxes write straight to the shared session tags, so the choice is the
 * same whether tagged on fs-source or fs-attach.
 */
export function TagEventsButton() {
  const { state, toggleTag, tagCount } = useSession();
  return <TagEventsPicker selected={state.tags} onToggle={toggleTag} count={tagCount} />;
}

interface PickerProps {
  selected: Record<EventTag, boolean>;
  onToggle: (tag: EventTag) => void;
  count: number;
}

/** Presentational tag control: the same pill and modal, driven by props (used by FamilySearch via session state and by Zotero via local state). */
export function TagEventsPicker({ selected, onToggle, count }: PickerProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Desktop modal: close on Escape (the native <dialog> handles this itself).
  useEffect(() => {
    if (isMobile || !open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, open]);

  // Mobile: drive the native <dialog> as a real modal popup.
  useEffect(() => {
    if (!isMobile) return;
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.show();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [isMobile, open]);

  const content = (
    <>
      <p className="tag-modal-title">Select the events this source should be attached to.</p>
      <div className="tag-modal-grid">
        {EVENT_TAGS.map((tag) => (
          <label key={tag} className="tag-option">
            <input type="checkbox" checked={selected[tag]} onChange={() => onToggle(tag)} /> {TAG_LABELS[tag]}
          </label>
        ))}
      </div>
      <button type="button" className="tag-modal-close" onClick={() => setOpen(false)}>
        Close
      </button>
    </>
  );

  return (
    <div className="tag-events">
      <button
        type="button"
        className="btn-success btn-sm tag-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="tag-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M7.5 1H3a2 2 0 0 0-2 2v4.5a2 2 0 0 0 .59 1.41l5.5 5.5a2 2 0 0 0 2.82 0l4.5-4.5a2 2 0 0 0 0-2.82l-5.5-5.5A2 2 0 0 0 7.5 1Zm-3 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
          />
        </svg>
        Tag this Source to Events
        {count > 0 && <span className="tag-badge">{count}</span>}
      </button>

      {isMobile ? (
        <dialog
          ref={dialogRef}
          className="tag-dialog"
          aria-label="Select the events this source should be attached to"
          onClose={() => setOpen(false)}
          onClick={(e) => {
            // Light-dismiss when the native backdrop (the dialog itself) is clicked.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="tag-modal">{content}</div>
        </dialog>
      ) : (
        open && (
          <div className="tag-modal-backdrop" onClick={() => setOpen(false)}>
            <div
              className="tag-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Select the events this source should be attached to"
              onClick={(e) => e.stopPropagation()}
            >
              {content}
            </div>
          </div>
        )
      )}
    </div>
  );
}
