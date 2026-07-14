import { useEffect, useMemo, useState } from 'react';

import { Card } from '../../components/Card';
import { api } from '../../lib/api';
import { getErrorMessage } from '../../lib/errors';
import type { AppSettings, HealthResponse, PatientProfile, SourceConfig } from '../../lib/types';
import { ProfileForm } from '../profile/ProfileForm';

type Props = {
  onCompleted: () => Promise<void>;
};

const defaultSettings: AppSettings = {
  daily_run_time: '08:30',
  default_report_style: 'clinical',
  default_report_length: 'daily_summary',
  demo_profile_enabled: false,
  privacy_mode: 'local_only',
  deidentified_ai_disclosure_acknowledged: false
};

const blankProfile: PatientProfile = {
  profile_name: 'My profile',
  display_name: '',
  date_of_birth: '',
  cancer_type: '',
  subtype: '',
  stage_or_context: '',
  current_therapy_status: '',
  location_label: '',
  travel_radius_miles: 100,
  notes: '',
  would_consider: [],
  would_not_consider: [],
  is_active: true,
  biomarkers: [{ name: '', variant: '', status: '', notes: '' }],
  therapy_history: [{ therapy_name: '', therapy_type: '', line_of_therapy: '', status: '', notes: '' }]
};

// Things people can add later to sharpen matching, surfaced on the final step so
// skipping them during setup feels intentional, not like missing a required step.
const IMPROVE_LATER = [
  'Subtype and stage',
  'Biomarkers and mutations',
  'Therapy history',
  'Travel preferences',
  'AI-assisted plain-language summaries',
  'Automatic daily check time'
];

export function OnboardingWizard({ onCompleted }: Props) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<PatientProfile>(blankProfile);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      setBusy(true);
      setErrorMessage('');
      try {
        const [appSettings, sourceConfigs] = await Promise.all([api.getSettings(), api.getSources()]);
        setSettings(appSettings);
        setSources(sourceConfigs);
      } catch (error) {
        setErrorMessage(getErrorMessage(error, 'Could not load local onboarding settings.'));
      } finally {
        setBusy(false);
      }
    }

    void load();
  }, []);

  const steps = useMemo(
    () => [
      {
        label: 'Welcome',
        title: 'Set up a calm local briefing workflow.',
        description: 'Firstlight focuses on real trial and literature monitoring, conservative language, and clinician review.'
      },
      {
        label: 'The essentials',
        title: 'Add just enough to begin.',
        description: 'A name, the cancer type, and a location are all Firstlight needs to start. Everything else can wait.'
      },
      {
        label: 'Sources & privacy',
        title: 'Choose sources and confirm privacy.',
        description: 'Pick which public sources Firstlight watches, then confirm the local-only privacy model.'
      },
      {
        label: 'Health Check',
        title: 'Verify local storage, reports, and the enabled real sources.',
        description: 'Blocking issues must be fixed before the dashboard opens. Warnings can be revisited later.'
      },
      {
        label: 'Complete',
        title: 'Finish setup and open the dashboard.',
        description: 'After setup, start with a manual check and add more detail whenever you are ready.'
      }
    ],
    []
  );

  async function saveProfile(tempProfile: PatientProfile) {
    setErrorMessage('');
    setProfile(tempProfile);
    setStep(2);
  }

  function continueFromSources() {
    setErrorMessage('');
    setNotice('');
    if (!sources.some((source) => source.enabled)) {
      setErrorMessage('Enable at least one real source before continuing.');
      return;
    }
    if (!privacyConfirmed) {
      setErrorMessage('Please confirm you understand Firstlight keeps everything on this computer.');
      return;
    }
    setStep(3);
  }

  async function runHealth() {
    setErrorMessage('');
    setNotice('');
    setBusy(true);
    try {
      const result = await api.getHealth();
      setHealth(result);
      if (result.overall_ok && result.items.some((item) => !item.ok && !item.blocking)) {
        setNotice('Setup can continue. Resolve warnings later if you choose.');
      } else if (result.overall_ok) {
        setNotice('This computer is ready for local monitoring and report generation.');
      }
    } catch (error) {
      setHealth(null);
      setErrorMessage(getErrorMessage(error, 'Could not run the health check.'));
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    setErrorMessage('');
    setNotice('');
    setBusy(true);
    try {
      const saved = await api.createProfile(profile);
      await api.updateSettings({
        ...settings,
        default_profile_id: saved.id
      });

      await Promise.all(
        sources.map((source) =>
          api.updateSource(source.id, {
            enabled: source.enabled,
            settings_json: source.settings_json
          })
        )
      );

      await api.completeOnboarding({
        current_step: 'completed',
        welcome_acknowledged: true,
        is_completed: true
      });

      await onCompleted();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not finish setup.'));
    } finally {
      setBusy(false);
    }
  }

  const currentStep = steps[step];
  const progress = ((step + 1) / steps.length) * 100;
  const hasBlockingHealthFailure = health ? !health.overall_ok : false;

  return (
    <div className="onboarding-shell">
      <div className="onboarding-sidebar">
        <div className="sidebar-brand">
          <span className="wordmark">Firstlight</span>
          <div className="wordmark-sub">Set up local oncology monitoring</div>
        </div>
        <div className="onboarding-sidebar-copy">
          <div className="eyebrow">Private setup</div>
          <h1>A steady trial and literature briefing routine.</h1>
          <p>Everything stays on this computer. Findings still need clinician review.</p>
        </div>
        <ol className="step-list">
          {steps.map((item, index) => (
            <li
              key={item.label}
              className={
                index === step ? 'step-item active' : index < step ? 'step-item done' : 'step-item'
              }
            >
              <span>{index + 1}</span>
              <strong>{item.label}</strong>
            </li>
          ))}
        </ol>
      </div>

      <div className="onboarding-content">
        <div className="onboarding-progress">
          <div>
            <div className="eyebrow">
              Step {step + 1} of {steps.length}
            </div>
            <h2>{currentStep.title}</h2>
            <p className="muted">{currentStep.description}</p>
          </div>
          <div className="progress-track" aria-hidden="true">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {step === 0 && (
          <Card
            title="Welcome to Firstlight"
            description="A local-first workspace for tracking real public oncology information that may be worth discussing with a care team."
          >
            <div className="stack">
              <p>
                Firstlight monitors trials and research that <strong>may be relevant</strong> so you can bring
                structured, source-backed notes to a doctor visit.
              </p>
              <div className="mini-stats-grid onboarding-highlights">
                <div className="mini-stat">
                  <span className="mini-stat-label">Trials</span>
                  <strong>ClinicalTrials.gov</strong>
                </div>
                <div className="mini-stat">
                  <span className="mini-stat-label">Literature</span>
                  <strong>PubMed excerpts</strong>
                </div>
                <div className="mini-stat">
                  <span className="mini-stat-label">Reports</span>
                  <strong>Local PDF briefings</strong>
                </div>
              </div>
              <div className="callout">
                It does <strong>not</strong> determine treatment, confirm eligibility, or replace an oncology team.
              </div>
              {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}
              <button className="primary-button" onClick={() => setStep(1)} disabled={busy}>
                Start setup
              </button>
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card
            title="The essentials"
            description="Just the basics to begin. You can add more detail any time from Patient Details."
          >
            <ProfileForm initialValue={profile} onSave={saveProfile} submitLabel="Save and continue" variant="essentials" />
          </Card>
        )}

        {step === 2 && (
          <Card
            title="Sources & privacy"
            description="Confirm which real sources are enabled and how your information is handled."
          >
            <div className="stack">
              <h4 className="section-divider">Enabled real sources</h4>
              <div className="stack">
                {sources.map((source) => (
                  <label className="toggle-row" key={source.id}>
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      onChange={(e) =>
                        setSources((current) =>
                          current.map((item) => (item.id === source.id ? { ...item, enabled: e.target.checked } : item))
                        )
                      }
                    />
                    <div>
                      <strong>{source.name}</strong>
                      <div className="muted">{source.category}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="callout">
                Automatic checks are local and truthful in this release: they only happen while Firstlight stays open on
                this computer. You can start a manual check any time, and set an automatic check time later in Settings.
              </div>

              <h4 className="section-divider">Privacy</h4>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={privacyConfirmed}
                  onChange={(e) => setPrivacyConfirmed(e.target.checked)}
                />
                <div>
                  <strong>I understand my information stays on this computer</strong>
                  <div className="muted">
                    Firstlight runs local-only by default and needs no account or AI key. You can turn on optional
                    AI-assisted summaries later in Settings.
                  </div>
                </div>
              </label>

              {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}

              <div className="button-row">
                <button className="ghost-button" onClick={() => setStep(1)}>
                  Back
                </button>
                <button className="primary-button" onClick={continueFromSources}>
                  Continue
                </button>
              </div>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card
            title="Health check"
            description="This checks local storage, the database, PDF generation, and the enabled real data sources."
          >
            <div className="stack">
              <button className="primary-button" disabled={busy} onClick={runHealth}>
                {busy ? 'Running checks...' : 'Run health check'}
              </button>
              {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}
              {notice && <div className="callout" role="status">{notice}</div>}
              {health && (
                <div className="health-grid">
                  {health.items.map((item) => {
                    const statusClass = item.ok ? 'ok' : item.blocking ? 'error' : 'warning';
                    return (
                      <div key={item.key} className={`health-item ${statusClass}`}>
                        <strong>{item.label}</strong>
                        <div>{item.message}</div>
                        <div className="muted">{item.blocking ? 'Blocking check' : 'Warning only'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {hasBlockingHealthFailure && (
                <div className="callout callout-danger" role="alert">
                  Resolve the blocking items before finishing setup.
                </div>
              )}
              <div className="button-row">
                <button className="ghost-button" onClick={() => setStep(2)}>
                  Back
                </button>
                <button
                  className="primary-button"
                  onClick={() => setStep(4)}
                  disabled={!health || hasBlockingHealthFailure}
                >
                  Continue
                </button>
              </div>
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card
            title="Setup complete"
            description="The workspace is configured locally and ready to open the main dashboard."
          >
            <div className="stack">
              <p>Firstlight is ready on this computer.</p>
              <p>
                Everything stays local. Automatic checks only happen while Firstlight stays open on this computer — you
                can set a preferred time in Settings whenever you like.
              </p>
              <div className="callout">
                <strong>Improve matching later.</strong> When you are ready, add these from Patient Details to sharpen
                the results — Firstlight will also remind you on the dashboard:
                <ul>
                  {IMPROVE_LATER.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              {errorMessage && <div className="callout callout-danger" role="alert">{errorMessage}</div>}
              <button className="primary-button" disabled={busy} onClick={finalize}>
                {busy ? 'Finishing...' : 'Open dashboard'}
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
