import { useEffect, useRef, type ReactNode } from 'react';

/** Centered dialog over a dimmed backdrop; Escape or a backdrop click closes it. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  // Latest onClose without re-running the effects (it is a new function every render).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const root = panel.current;
    (
      root?.querySelector<HTMLElement>('textarea') ??
      root?.querySelector<HTMLElement>('.feedback-actions button, .modal-actions button')
    )?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') closeRef.current();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="modal-panel" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}
