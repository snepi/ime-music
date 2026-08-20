import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
}

export function Modal({ open, title, onClose, children, footer, width = 440, className = '' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const wasOpenRef = useRef(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);

    // Focus dialog only when it first opens — never steal focus from inputs on re-render
    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      const active = document.activeElement as HTMLElement | null;
      const alreadyInside = Boolean(active && dialogRef.current?.contains(active));
      if (!alreadyInside) {
        dialogRef.current?.focus();
      }
    }

    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => onCloseRef.current()} role="presentation">
      <div
        className={`modal ${className}`.trim()}
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={() => onCloseRef.current()} aria-label="Закрыть">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
