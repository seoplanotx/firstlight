import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm action as destructive (red). */
  danger?: boolean;
  /** Disable both actions while the confirmed work runs. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// An in-app confirmation dialog in the app's own voice — replaces the native
// window.confirm() for destructive or unsaved-work decisions. Focus opens on the
// safe (cancel) action, Escape and backdrop-click cancel, and focus is trapped
// while open and restored to the trigger on close.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])');
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" ref={dialogRef}>
        <h2 id="confirm-dialog-title" className="modal-title">
          {title}
        </h2>
        <div className="modal-body">{message}</div>
        <div className="modal-actions">
          <button type="button" className="secondary-button" ref={cancelRef} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'primary-button danger-button' : 'primary-button'}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
