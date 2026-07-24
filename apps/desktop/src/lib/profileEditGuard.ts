// A shared "unsaved profile edits" signal. The Patient Details page owns the
// edit form, but a profile switch can also be triggered from the sidebar select,
// so both need to agree on whether there are unsaved edits before discarding them.
let dirty = false;

export function setProfileEditsDirty(value: boolean): void {
  dirty = value;
}

export function hasUnsavedProfileEdits(): boolean {
  return dirty;
}
