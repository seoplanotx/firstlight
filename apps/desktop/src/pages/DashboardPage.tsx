import { useEffect, useMemo, useState } from 'react';

import { BriefingBlockers } from '../components/BriefingBlockers';
import { BriefingSection } from '../components/BriefingSection';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Dashboard } from '../lib/types';

function jumpToSection(anchorId: string) {
  document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [runBusy, setRunBusy] = useState(false);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await api.getDashboard();
      setData(result);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load the dashboard.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleRunNow() {
    setRunBusy(true);
    setNotice('');
    setErrorMessage('');
    try {
      await api.triggerRun();
      setNotice('Monitoring finished and the dashboard has been refreshed.');
      await load();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not start monitoring.'));
      await load();
    } finally {
      setRunBusy(false);
    }
  }

  const latestRunLabel = useMemo(() => {
    if (!data) return 'Run monitoring to populate the first briefing.';
    if (data.briefing.latest_run_completed_at) {
      return `Latest completed run: ${new Date(data.briefing.latest_run_completed_at).toLocaleString()}`;
    }
    if (data.latest_run) {
      return `Latest run started: ${new Date(data.latest_run.started_at).toLocaleString()}`;
    }
    return 'Run monitoring to populate the first briefing.';
  }, [data]);

  if (loading) return <div className="loading-block">Loading dashboard...</div>;
  if (errorMessage && !data) {
    return <PageErrorState title="Dashboard unavailable" message={errorMessage} onRetry={load} />;
  }
  if (!data) return <EmptyState title="Dashboard unavailable" message="The dashboard could not be loaded." />;

  const runInProgress = runBusy || data.latest_run?.status === 'running';
  const sourceStatuses = data.briefing.source_statuses || [];
  const sourceFailures = data.briefing.source_failures || [];
  const suggestedQuestions = data.briefing.suggested_questions || [];
  const questionGenerationStatus =
    typeof data.briefing.question_generation?.status === 'string'
      ? data.briefing.question_generation.status.replace(/_/g, ' ')
      : 'deterministic fallback';

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Local monitoring</div>
          <h1>Dashboard</h1>
          <p className="page-lede">
            Scan what is new, what changed, and what still needs clinician context. Automatic runs happen only while
            Firstlight is open.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="primary-button" onClick={() => void handleRunNow()} disabled={runInProgress}>
            {runInProgress ? 'Monitoring...' : 'Run now'}
          </button>
        </div>
      </div>

      {notice && <div className="callout">{notice}</div>}
      {errorMessage && <div className="callout callout-danger">{errorMessage}</div>}

      <div className="stat-strip">
        <div className="stat">
          <span className="stat-num">{data.counts.new || 0}</span>
          <span className="stat-label">New since last run</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.counts.changed || 0}</span>
          <span className="stat-label">Changed findings</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.counts.high_relevance || 0}</span>
          <span className="stat-label">High relevance</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.counts.trial_matches || 0}</span>
          <span className="stat-label">Trial matches</span>
        </div>
      </div>

      <Card
        title="What changed since the last run?"
        description={latestRunLabel}
        className="hero-card"
        action={
          <button className="secondary-button" onClick={() => (window.location.hash = '#/reports')}>
            Open reports
          </button>
        }
      >
        <div className="briefing-hero">
          <div className="briefing-copy">
            <div className="eyebrow">Daily briefing</div>
            <h2>Start with the net-new items, then review changes that may affect follow-up questions.</h2>
          </div>
          <div className="briefing-metrics">
            <div className="briefing-metric">
              <span className="briefing-metric-label">New</span>
              <strong>{data.briefing.new_count}</strong>
            </div>
            <div className="briefing-metric">
              <span className="briefing-metric-label">Changed</span>
              <strong>{data.briefing.changed_count}</strong>
            </div>
            <div className="briefing-metric">
              <span className="briefing-metric-label">Blockers</span>
              <strong>{data.briefing.blockers.length}</strong>
            </div>
            <div className="briefing-metric">
              <span className="briefing-metric-label">Source issues</span>
              <strong>{sourceFailures.length}</strong>
            </div>
          </div>
        </div>

        <div className="button-row hero-actions">
          <button className="secondary-button" onClick={() => jumpToSection('dashboard-new-findings')}>
            View new findings
          </button>
          <button className="secondary-button" onClick={() => jumpToSection('dashboard-changed-findings')}>
            View changed findings
          </button>
          <button className="secondary-button" onClick={() => jumpToSection('dashboard-blockers')}>
            View blockers
          </button>
        </div>
      </Card>

      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          {data.briefing.sections.map((section) => (
            <BriefingSection
              key={section.key}
              section={section}
              anchorId={`dashboard-${section.key.replace(/_/g, '-')}`}
            />
          ))}
        </div>

        <div className="dashboard-side-column">
          <Card
            title="Run status"
            description="Monitoring cadence and the most recent execution details."
            className="side-panel-card"
          >
            {data.latest_run ? (
              <div className="detail-grid">
                <div>
                  <strong>Last run</strong>
                  <div>{new Date(data.latest_run.started_at).toLocaleString()}</div>
                </div>
                <div>
                  <strong>Status</strong>
                  <div>{data.latest_run.status}</div>
                </div>
                <div>
                  <strong>Triggered by</strong>
                  <div>{data.latest_run.triggered_by}</div>
                </div>
                <div>
                  <strong>Next automatic run while open</strong>
                  <div>{data.next_scheduled_run ? new Date(data.next_scheduled_run).toLocaleString() : 'Not scheduled'}</div>
                </div>
              </div>
            ) : (
              <EmptyState title="No runs yet" message="Use Run now to populate the first monitoring results." />
            )}
          </Card>

          <div id="dashboard-blockers">
            <BriefingBlockers blockers={data.briefing.blockers} />
          </div>

          <Card
            title="Heartbeat questions"
            description={`Generated by ${questionGenerationStatus}. Use these as review prompts, not medical advice.`}
            className="side-panel-card"
          >
            {suggestedQuestions.length === 0 ? (
              <EmptyState title="No questions yet" message="Run monitoring to generate source-backed review prompts." />
            ) : (
              <div className="headline-list">
                {suggestedQuestions.map((question) => (
                  <article className="headline-item" key={question}>
                    <strong>{question}</strong>
                  </article>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Source heartbeat"
            description="Source-by-source status from the latest monitoring cycle."
            className="side-panel-card"
          >
            {sourceStatuses.length === 0 ? (
              <EmptyState title="No source status yet" message="Run monitoring to check each enabled source." />
            ) : (
              <div className="headline-list">
                {sourceStatuses.map((source) => (
                  <article className="headline-item" key={source.connector_key}>
                    <strong>{source.connector_key}</strong>
                    <div className={source.status === 'ok' ? 'muted' : 'callout callout-danger'}>
                      {source.status} • {source.retrieved} retrieved{source.message ? ` • ${source.message}` : ''}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>

          <Card title="Recent surfaced items" description="A quick glance at the latest stored records." className="side-panel-card">
            {data.recent_findings.length === 0 ? (
              <EmptyState title="No findings stored" message="Once a run completes, findings will appear here." />
            ) : (
              <div className="headline-list">
                {data.recent_findings.slice(0, 5).map((item) => (
                  <article className="headline-item" key={item.id}>
                    <strong>{item.title}</strong>
                    <div className="muted">
                      {item.source_name} • {new Date(item.published_at || item.retrieved_at).toLocaleString()}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
