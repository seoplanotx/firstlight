import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

import { Card } from '../components/Card';
import { PageErrorState } from '../components/PageErrorState';
import { ProfileForm } from '../features/profile/ProfileForm';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
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
  const dirtyRef = useRef(false);

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
    if (blocker.state !== 'blocked') return;
    if (window.confirm(LEAVE_PROMPT)) {
      dirtyRef.current = false;
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

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
      dirtyRef.current = false;
      setMessage('Profile saved locally.');
      const all = await api.getProfiles();
      setProfiles(all);
      window.dispatchEvent(new Event('firstlight:profile-changed'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not save the patient profile.'));
    }
  }

  async function handleActivate(profileId: number) {
    if (dirtyRef.current && !window.confirm(LEAVE_PROMPT)) return;
    try {
      const activated = await api.activateProfile(profileId);
      setProfile(activated);
      dirtyRef.current = false;
      setMessage(`Now monitoring ${activated.display_name || activated.profile_name}.`);
      window.dispatchEvent(new Event('firstlight:profile-changed'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not switch profiles.'));
    }
  }

  function startNewProfile() {
    if (dirtyRef.current && !window.confirm(LEAVE_PROMPT)) return;
    setProfile(emptyProfile());
    dirtyRef.current = false;
    setMessage('Creating a new local profile. Save when ready.');
  }

  async function handleExtract() {
    setExtractBusy(true);
    setExtractWarnings([]);
    setErrorMessage('');
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
      setMessage('Suggestions applied to the form — review carefully, then save.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not extract profile candidates.'));
    } finally {
      setExtractBusy(false);
    }
  }

  if (loading) return <div className="loading-block" role="status">Loading patient profile...</div>;
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
          <textarea
            id="profile-report-text"
            aria-label="Pathology or molecular report text"
            rows={6}
            value={extractText}
            onChange={(e) => setExtractText(e.target.value)}
            placeholder="Paste pathology or molecular report text here…"
          />
          <div className="button-row">
            <button className="secondary-button" type="button" disabled={extractBusy || !extractText.trim()} onClick={() => void handleExtract()}>
              {extractBusy ? 'Reading…' : 'Suggest profile fields'}
            </button>
          </div>
          {extractWarnings.map((warning) => (
            <div className="callout" role="status" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Edit details" description="Add only the facts you are confident in. Everything stays encrypted on this computer.">
        {message && <div className="callout" role="status">{message}</div>}
        {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}
        <ProfileForm
          key={profile?.id || 'new-profile'}
          initialValue={profile}
          onSave={handleSave}
          submitLabel={profile?.id ? 'Save profile' : 'Create profile'}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
        />
      </Card>
    </div>
  );
}
