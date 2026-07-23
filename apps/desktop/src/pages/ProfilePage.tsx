import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PageErrorState } from '../components/PageErrorState';
import { ProfileForm } from '../features/profile/ProfileForm';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { setProfileEditsDirty } from '../lib/profileEditGuard';
import type { PatientProfile } from '../lib/types';

const LEAVE_PROMPT = 'You have unsaved profile changes. Leave without saving?';

const emptyProfile = (): PatientProfile => ({
  profile_name: 'New profile',
  display_name: '',
  cancer_type: '',
  would_consider: [],
  would_not_consider: [],
  is_active: true,
  biomarkers: [],
  therapy_history: []
});

export function ProfilePage() {
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [extractText, setExtractText] = useState('');
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractWarnings, setExtractWarnings] = useState<string[]>([]);
  const [extractNote, setExtractNote] = useState('');
  const [extractError, setExtractError] = useState('');
  const dirtyRef = useRef(false);
  const [leavePrompt, setLeavePrompt] = useState<
    { kind: 'route' } | { kind: 'activate'; profileId: number } | { kind: 'new' } | null
  >(null);

  function markDirty(value: boolean) {
    dirtyRef.current = value;
    setProfileEditsDirty(value);
  }

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const [all, current] = await Promise.all([api.getProfiles(), api.getActiveProfile()]);
      setProfiles(all);
      setProfile(current);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load the active profile.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    function onProfileChanged() {
      void load();
    }
    window.addEventListener('firstlight:profile-changed', onProfileChanged);
    return () => window.removeEventListener('firstlight:profile-changed', onProfileChanged);
  }, []);

  const blocker = useBlocker(() => dirtyRef.current);

  useEffect(() => {
    if (blocker.state === 'blocked') setLeavePrompt({ kind: 'route' });
  }, [blocker]);

  // Clear the shared signal when leaving Patient Details so other switch paths
  // aren't guarded against edits that no longer exist.
  useEffect(() => () => setProfileEditsDirty(false), []);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = LEAVE_PROMPT;
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  async function handleSave(payload: PatientProfile) {
    setMessage('');
    setErrorMessage('');
    try {
      const saved = payload.id ? await api.updateProfile(payload.id, payload) : await api.createProfile(payload);
      setProfile(saved);
      markDirty(false);
      setMessage('Profile saved locally.');
      const all = await api.getProfiles();
      setProfiles(all);
      window.dispatchEvent(new Event('firstlight:profile-changed'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not save the patient profile.'));
    }
  }

  async function doActivate(profileId: number) {
    try {
      const activated = await api.activateProfile(profileId);
      setProfile(activated);
      markDirty(false);
      setMessage(`Now monitoring ${activated.display_name || activated.profile_name}.`);
      window.dispatchEvent(new Event('firstlight:profile-changed'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not switch profiles.'));
    }
  }

  function handleActivate(profileId: number) {
    if (dirtyRef.current) {
      setLeavePrompt({ kind: 'activate', profileId });
      return;
    }
    void doActivate(profileId);
  }

  function doNewProfile() {
    setProfile(emptyProfile());
    markDirty(false);
    setMessage('Creating a new local profile. Save when ready.');
  }

  function startNewProfile() {
    if (dirtyRef.current) {
      setLeavePrompt({ kind: 'new' });
      return;
    }
    doNewProfile();
  }

  function confirmLeave() {
    const action = leavePrompt;
    setLeavePrompt(null);
    if (!action) return;
    markDirty(false);
    if (action.kind === 'route') blocker.proceed?.();
    else if (action.kind === 'activate') void doActivate(action.profileId);
    else doNewProfile();
  }

  function cancelLeave() {
    const action = leavePrompt;
    setLeavePrompt(null);
    if (action?.kind === 'route') blocker.reset?.();
  }

  async function handleExtract() {
    setExtractBusy(true);
    setExtractWarnings([]);
    setExtractNote('');
    setExtractError('');
    try {
      const result = await api.extractProfileFromText(extractText);
      setExtractWarnings(result.warnings || []);
      setProfile((current) => {
        const base = current || emptyProfile();
        return {
          ...base,
          cancer_type: result.cancer_type || base.cancer_type,
          subtype: result.subtype || base.subtype,
          stage_or_context: result.stage_or_context || base.stage_or_context,
          notes: [base.notes, result.notes].filter(Boolean).join('\n') || base.notes,
          biomarkers:
            result.biomarkers?.length
              ? [
                  ...base.biomarkers,
                  ...result.biomarkers.map((item) => ({
                    name: item.name,
                    variant: item.variant || null,
                    status: item.status || null,
                    notes: item.notes || null
                  }))
                ]
              : base.biomarkers,
          therapy_history:
            result.therapy_history?.length
              ? [
                  ...base.therapy_history,
                  ...result.therapy_history.map((item) => ({
                    therapy_name: item.therapy_name,
                    therapy_type: item.therapy_type || null,
                    line_of_therapy: item.line_of_therapy || null,
                    status: item.status || null,
                    notes: item.notes || null
                  }))
                ]
              : base.therapy_history
        };
      });
      dirtyRef.current = true;
      setExtractNote('Suggestions applied to the form below — review carefully, then save.');
    } catch (error) {
      setExtractError(getErrorMessage(error, 'Could not extract profile candidates.'));
    } finally {
      setExtractBusy(false);
    }
  }

  if (loading) return <div className="loading-block" role="status">Loading patient profile…</div>;
  if (errorMessage && !profile) {
    return <PageErrorState title="Profile unavailable" message={errorMessage} onRetry={load} />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Configure</div>
          <h1>Patient Details</h1>
          <p className="page-lede">
            These details are what Firstlight uses to decide which trials and research to surface. The more you can add,
            the better the matches — but a blank field is always safer than a guess.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="secondary-button" type="button" onClick={startNewProfile}>
            Add another person
          </button>
        </div>
      </div>

      {profiles.length > 0 && (
        <Card title="Profiles on this computer" description="Switch who Firstlight monitors. Each profile stays local.">
          <div className="filter-chip-row">
            {profiles.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === profile?.id ? 'filter-chip active' : 'filter-chip'}
                onClick={() => item.id && void handleActivate(item.id)}
              >
                {item.display_name || item.profile_name}
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card
        title="Paste a report (optional)"
        description="Local rules-based suggestions only. Nothing is sent to an AI provider. Confirm every field before saving."
      >
        <div className="stack">
          <div className="field">
            <label htmlFor="profile-report-text">Pathology or molecular report text</label>
            <textarea
              id="profile-report-text"
              rows={6}
              value={extractText}
              onChange={(e) => setExtractText(e.target.value)}
              placeholder="Paste pathology or molecular report text here…"
            />
          </div>
          <div className="button-row">
            <button className="secondary-button" type="button" disabled={extractBusy || !extractText.trim()} onClick={() => void handleExtract()}>
              {extractBusy ? 'Reading…' : 'Suggest profile fields'}
            </button>
          </div>
          {extractError && <div className="callout callout-caution" role="alert">{extractError}</div>}
          {extractNote && <div className="callout" role="status">{extractNote}</div>}
          {extractWarnings.map((warning) => (
            <div className="callout" role="status" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Edit details" description="Add only the facts you are confident in. Everything stays encrypted on this computer.">
        {message && <div className="callout" role="status">{message}</div>}
        {errorMessage && <div className="callout callout-caution" role="alert">{errorMessage}</div>}
        <ProfileForm
          key={profile?.id || 'new-profile'}
          initialValue={profile}
          onSave={handleSave}
          submitLabel={profile?.id ? 'Save profile' : 'Create profile'}
          onDirtyChange={markDirty}
        />
      </Card>

      <ConfirmDialog
        open={leavePrompt !== null}
        title="Leave without saving?"
        message="You have unsaved changes to this profile. If you continue, those changes will be lost."
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        onConfirm={confirmLeave}
        onCancel={cancelLeave}
      />
    </div>
  );
}
