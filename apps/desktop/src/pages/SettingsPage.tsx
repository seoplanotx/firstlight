import { useEffect, useState } from 'react';

import { Card } from '../components/Card';
import { PageErrorState } from '../components/PageErrorState';
import { AIProviderSetup } from '../features/ai/AIProviderSetup';
import { ClaudeDesktopConnection } from '../features/ai/ClaudeDesktopConnection';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { setLanguageMode, useLanguageMode } from '../lib/languageMode';
import type { AppSettings, SourceConfig } from '../lib/types';

const SOURCE_BLURBS: Record<string, string> = {
  clinicaltrials_gov: 'Government registry of clinical trials',
  openfda_drug_updates: 'FDA drug approvals and label changes',
  europepmc_preprints: 'Early-release research preprints',
  pubmed_literature: 'Peer-reviewed medical literature',
};

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [sources, setSources] = useState<SourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const languageMode = useLanguageMode();

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const [settingsResult, sourceResult] = await Promise.all([api.getSettings(), api.getSources()]);
      setSettings(settingsResult);
      setSources(sourceResult);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load local settings.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <div className="loading-block">Loading settings...</div>;
  if (errorMessage && !settings) {
    return <PageErrorState title="Settings unavailable" message={errorMessage} onRetry={load} />;
  }
  if (!settings) {
    return <PageErrorState title="Settings unavailable" message="The local settings payload was empty." onRetry={load} />;
  }

  async function saveGeneral() {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const saved = await api.updateSettings(settings);
      setSettings(saved);
      setNotice('Settings saved locally.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not save local settings.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveSource(source: SourceConfig) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const saved = await api.updateSource(source.id, { enabled: source.enabled, settings_json: source.settings_json });
      setSources((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setNotice(`${saved.name} updated locally.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not update the selected source.'));
    } finally {
      setBusy(false);
    }
  }

  const needsAiDisclosureAcknowledgement =
    settings.privacy_mode === 'deidentified_ai_assist' && !settings.deidentified_ai_disclosure_acknowledged;

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Settings</h1>
          <p className="page-lede">
            Adjust while-open monitoring, report defaults, and the real sources available in this release.
          </p>
        </div>
      </div>

      {notice && <div className="callout">{notice}</div>}
      {errorMessage && <div className="callout callout-danger">{errorMessage}</div>}

      <Card
        title="General settings"
        description="Automatic checks are local and only happen while Firstlight stays open on this computer."
      >
        <div className="form-grid">
          <div className="field">
            <label>Wording</label>
            <select value={languageMode} onChange={(e) => setLanguageMode(e.target.value as 'plain' | 'clinical')}>
              <option value="plain">Plain language (recommended)</option>
              <option value="clinical">Clinical terms</option>
            </select>
            <div className="field-hint">
              Plain language keeps labels everyday and friendly. Clinical terms show standard medical wording if you
              prefer it.
            </div>
          </div>
          <div className="field">
            <label>Automatic check time while open</label>
            <input
              type="time"
              value={settings.daily_run_time}
              onChange={(e) => setSettings({ ...settings, daily_run_time: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Report style</label>
            <select
              value={settings.default_report_style}
              onChange={(e) => setSettings({ ...settings, default_report_style: e.target.value })}
            >
              <option value="clinical">Clinical</option>
              <option value="plain">Plain English</option>
            </select>
          </div>
          <div className="field">
            <label>Default report type</label>
            <select
              value={settings.default_report_length}
              onChange={(e) => setSettings({ ...settings, default_report_length: e.target.value })}
            >
              <option value="daily_summary">Daily summary</option>
              <option value="full_review">Full oncology review</option>
            </select>
          </div>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={saveGeneral} disabled={busy || needsAiDisclosureAcknowledgement}>
            Save general settings
          </button>
          <button className="secondary-button" onClick={() => (window.location.hash = '#/support')}>
            Open support details
          </button>
        </div>
      </Card>

      <Card
        title="AI privacy mode"
        description="Choose whether Firstlight stays fully local or can use optional cloud AI with minimized, de-identified oncology context."
      >
        <div className="stack">
          <div className="field">
            <label>AI assist mode</label>
            <select
              value={settings.privacy_mode}
              onChange={(e) => {
                const privacyMode = e.target.value as AppSettings['privacy_mode'];
                setSettings({
                  ...settings,
                  privacy_mode: privacyMode,
                  deidentified_ai_disclosure_acknowledged:
                    privacyMode === 'deidentified_ai_assist'
                      ? settings.deidentified_ai_disclosure_acknowledged
                      : false
                });
              }}
            >
              <option value="local_only">Mode 1 — Local-only</option>
              <option value="deidentified_ai_assist">Mode 2 — De-identified AI assist</option>
            </select>
          </div>
          <div className="callout">
            <strong>Mode 1:</strong> patient context stays on this device. Firstlight uses local rules and source-backed reports only.
            <br />
            <strong>Mode 2:</strong> identifying details stay local, but minimized cancer context may be sent to your selected AI provider for summaries and briefing questions.
          </div>
          {settings.privacy_mode === 'deidentified_ai_assist' && (
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={settings.deidentified_ai_disclosure_acknowledged}
                onChange={(e) =>
                  setSettings({ ...settings, deidentified_ai_disclosure_acknowledged: e.target.checked })
                }
              />
              <div>
                <strong>I understand de-identified cancer context can still be sensitive.</strong>
                <div className="muted">
                  Firstlight will strip local identity fields before cloud AI calls, but cancer type, stage, biomarkers,
                  prior therapies, and public source text may leave this device when AI assist is enabled.
                </div>
              </div>
            </label>
          )}
          {needsAiDisclosureAcknowledgement && (
            <div className="callout callout-danger">Acknowledge the AI privacy disclosure before saving Mode 2.</div>
          )}
        </div>
      </Card>

      <Card
        title="AI provider"
        description="Bring your own API key — Anthropic (Claude) directly, or OpenRouter. It powers Mode 2 summaries and briefing questions, is encrypted, and never leaves this computer."
      >
        <AIProviderSetup />
      </Card>

      <Card
        title="Claude Desktop connection"
        description="Optional: let Claude Desktop read your Firstlight findings through a local, read-only connection you control."
      >
        <ClaudeDesktopConnection />
      </Card>

      <Card
        title="Real sources"
        description="This public release keeps the source list honest: real public registries and literature sources only."
      >
        <div className="stack">
          {sources.map((source) => (
            <label className="toggle-row source-toggle" key={source.id}>
              <input
                type="checkbox"
                checked={source.enabled}
                disabled={busy}
                onChange={(e) => void saveSource({ ...source, enabled: e.target.checked })}
              />
              <div>
                <strong>{source.name}</strong>
                <div className="muted">{SOURCE_BLURBS[source.connector_key] ?? source.name}</div>
              </div>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}
