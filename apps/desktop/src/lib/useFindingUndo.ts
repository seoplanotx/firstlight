import { useEffect, useRef, useState } from 'react';

import { api } from './api';
import { getErrorMessage } from './errors';
import type { FindingAction } from './types';

// Long enough that a phone-call interruption doesn't lose the undo.
const UNDO_TIMEOUT_MS = 15000;

const ACTION_CONFIRMATIONS: Record<FindingAction, string> = {
  discuss: 'Saved for discussion — waiting in Doctor Visit.',
  dismissed: 'Set aside.',
  none: 'Removed from this list.'
};

type UndoState = { id: number; previous: FindingAction; message: string } | null;

// Shared undo behavior for the single-action finding lists (Trials, Saved) so a
// card action can always be reversed within a comfortable window — matching the
// review queue. `reload` refreshes the list; `onError` surfaces action failures.
export function useFindingUndo(reload: () => Promise<void>, onError: (message: string) => void) {
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [undo, setUndo] = useState<UndoState>(null);
  const timer = useRef<number | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => () => clearTimer(), []);

  async function apply(findingId: number, action: FindingAction, previous: FindingAction, offerUndo: boolean) {
    setPendingId(findingId);
    try {
      await api.setFindingAction(findingId, action);
      await reload();
      clearTimer();
      if (offerUndo && previous !== action) {
        setUndo({ id: findingId, previous, message: ACTION_CONFIRMATIONS[action] });
        timer.current = window.setTimeout(() => setUndo(null), UNDO_TIMEOUT_MS);
      } else {
        setUndo(null);
      }
    } catch (error) {
      onError(getErrorMessage(error, 'Could not update this item.'));
    } finally {
      setPendingId(null);
    }
  }

  function act(finding: { id: number; user_action: FindingAction }, action: FindingAction) {
    void apply(finding.id, action, finding.user_action, true);
  }

  function undoLast() {
    if (!undo) return;
    const target = undo;
    setUndo(null);
    clearTimer();
    void apply(target.id, target.previous, 'none', false);
  }

  return { pendingId, undo, act, undoLast };
}
