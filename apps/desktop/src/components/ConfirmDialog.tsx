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
  // Callers pass fresh arrow functions each render; keeping the latest values in
  // refs lets the effect depend only on `open`, so a parent re-render (e.g. when
  // `busy` flips) no longer yanks focus back to the trigger and then to Cancel.
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Like the backdrop, Escape cannot dismiss while the confirmed work runs.
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const inside = dialogRef.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        ref={dialogRef}
      >
        <h2 id="confirm-dialog-title" className="modal-title">
          {title}
        </h2>
        <div className="modal-body" id="confirm-dialog-message">
          {message}
        </div>
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
