import { useEffect, useRef, useState } from 'react';

import { Card } from '../components/Card';
import { PageErrorState } from '../components/PageErrorState';
import { ProfileForm } from '../features/profile/ProfileForm';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { PatientProfile } from '../lib/types';

const LEAVE_PROMPT = 'You have unsaved profile changes. Leave without saving?';

export function ProfilePage() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const dirtyRef = useRef(false);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const current = await api.getActiveProfile();
      setProfile(current);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load the active profile.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Guard against losing unsaved edits — both on window close/reload and on
  // in-app navigation (NavLink renders #/ anchors, so we intercept clicks).
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = LEAVE_PROMPT;
    }

    function handleCapturedClick(event: MouseEvent) {
      if (!dirtyRef.current) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.getAttribute('href') === '#/profile') return;
      if (!window.confirm(LEAVE_PROMPT)) {
        event.preventDefault();
        event.stopPropagation();
      } else {
        dirtyRef.current = false;
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('click', handleCapturedClick, true);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleCapturedClick, true);
    };
  }, []);

  async function handleSave(payload: PatientProfile) {
    setMessage('');
    setErrorMessage('');
    try {
      const saved = payload.id ? await api.updateProfile(payload.id, payload) : await api.createProfile(payload);
      setProfile(saved);
      dirtyRef.current = false;
      setMessage('Profile saved locally.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not save the patient profile.'));
    }
  }

  if (loading) return <div className="loading-block">Loading patient profile...</div>;
  if (errorMessage && !profile) {
    return <PageErrorState title="Profile unavailable" message={errorMessage} onRetry={load} />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Patient details</div>
          <h1>Patient Details</h1>
          <p className="page-lede">
            These details are what Firstlight uses to decide which trials and research to surface. The more you can add,
            the better the matches — but a blank field is always safer than a guess.
          </p>
        </div>
      </div>

      <Card title="Edit details" description="Add only the facts you are confident in. Everything stays encrypted on this computer.">
        {message && <div className="callout">{message}</div>}
        {errorMessage && <div className="callout callout-danger">{errorMessage}</div>}
        <ProfileForm
          initialValue={profile}
          onSave={handleSave}
          submitLabel={profile ? 'Save profile' : 'Create profile'}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
        />
      </Card>
    </div>
  );
}
