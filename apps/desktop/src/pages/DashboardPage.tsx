import { useEffect, useMemo, useState } from 'react';

import { BriefingBlockers } from '../components/BriefingBlockers';
import { BriefingSection } from '../components/BriefingSection';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import type { Dashboard, FindingAction } from '../lib/types';

const SOURCE_NAMES: Record<string, string> = {
  clinicaltrials_gov: 'ClinicalTrials.gov',
  pubmed_literature: 'PubMed',
  openfda_drug_updates: 'openFDA drug updates',
  europepmc_preprints: 'Europe PMC'
};

function friendlySourceName(connectorKey: string) {
  return SOURCE_NAMES[connectorKey] || connectorKey.replace(/_/g, ' ');
}

function jumpToSection(anchorId: string) {
  document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [personName, setPersonName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [runBusy, setRunBusy] = useState(false);
  const [pendingFindingId, setPendingFindingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await api.getDashboard();
      setData(result);
      try {
        const profile = await api.getActiveProfile();
        setPersonName(profile?.display_name || profile?.profile_name || '');
      } catch {
        // The dashboard still works without a personalized greeting.
      }
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
      setNotice('Done. The latest research has been pulled in and this page is up to date.');
      await load();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not check for new research.'));
      await load();
    } finally {
      setRunBusy(false);
    }
  }

  async function handleFindingAction(findingId: number, action: FindingAction) {
    setPendingFindingId(findingId);
    try {
      await api.setFindingAction(findingId, action);
      await load();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not update this item.'));
    } finally {
      setPendingFindingId(null);
    }
  }

  const latestRunLabel = useMemo(() => {
    if (!data) return 'Run your first check to see what is new.';
    if (data.briefing.latest_run_completed_at) {
      return `Last checked: ${new Date(data.briefing.latest_run_completed_at).toLocaleString()}`;
    }
    if (data.latest_run) {
      return `Check started: ${new Date(data.latest_run.started_at).toLocaleString()}`;
    }
    return 'Run your first check to see what is new.';
  }, [data]);

  if (loading) return <div className="loading-block">Loading...</div>;
  if (errorMessage && !data) {
    return <PageErrorState title="Dashboard unavailable" message={errorMessage} onRetry={load} />;
  }
  if (!data) return <EmptyState title="Dashboard unavailable" message="The dashboard could not be loaded." />;

  const runInProgress = runBusy || data.latest_run?.status === 'running';
  const sourceStatuses = data.briefing.source_statuses || [];
  const sourceFailures = data.briefing.source_failures || [];
  const suggestedQuestions = data.briefing.suggested_questions || [];
  const hasEverRun = Boolean(data.latest_run);
  const heading = personName ? `What's new for ${personName}` : 'Today';

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Your daily check</div>
          <h1>{heading}</h1>
          <p className="page-lede">
            A calm, once-a-day look at what is new in trials and research. Firstlight keeps watching while it runs in the
            menu bar or system tray and lets you know when something new lands.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="primary-button" onClick={() => void handleRunNow()} disabled={runInProgress}>
            {runInProgress ? 'Checking…' : hasEverRun ? 'Check now' : 'Run your first check'}
          </button>
        </div>
      </div>

      {notice && <div className="callout">{notice}</div>}
      {errorMessage && <div className="callout callout-danger">{errorMessage}</div>}

      {runInProgress && (
        <div className="callout first-run-callout">
          <strong>Checking for new research…</strong>
          <p>
            Firstlight is looking through ClinicalTrials.gov, PubMed, openFDA, and Europe PMC. This usually takes up to a
            minute — you can keep using the app while it works.
          </p>
        </div>
      )}

      {!hasEverRun && !runInProgress && (
        <Card title="Let's run your first check" className="first-run-card">
          <div className="stack">
            <p>
              When you run a check, Firstlight looks through the public research sources for anything that may be worth
              discussing with {personName ? personName + "'s" : 'your'} care team. The first one usually takes up to a
              minute.
            </p>
            <div className="mini-stats-grid">
              <div className="mini-stat">
                <span className="mini-stat-label">Trials</span>
                <strong>ClinicalTrials.gov</strong>
              </div>
              <div className="mini-stat">
                <span className="mini-stat-label">Research</span>
                <strong>PubMed &amp; Europe PMC</strong>
              </div>
              <div className="mini-stat">
                <span className="mini-stat-label">Drug updates</span>
                <strong>openFDA</strong>
              </div>
            </div>
            <button className="primary-button" onClick={() => void handleRunNow()} disabled={runInProgress}>
              Run your first check
            </button>
          </div>
        </Card>
      )}

      <div className="stat-strip">
        <div className="stat">
          <span className="stat-num">{data.counts.new || 0}</span>
          <span className="stat-label">New since last check</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.counts.changed || 0}</span>
          <span className="stat-label">Updated</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.counts.high_relevance || 0}</span>
          <span className="stat-label">Strong matches</span>
        </div>
        <div className="stat">
          <span className="stat-num">{data.counts.trial_matches || 0}</span>
          <span className="stat-label">Possible trials</span>
        </div>
      </div>

      {hasEverRun && (
        <Card
          title="What changed since your last check?"
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
              <h2>Start with what is new, then look at anything that changed and might be worth asking about.</h2>
            </div>
            <div className="briefing-metrics">
              <div className="briefing-metric">
                <span className="briefing-metric-label">New</span>
                <strong>{data.briefing.new_count}</strong>
              </div>
              <div className="briefing-metric">
                <span className="briefing-metric-label">Updated</span>
                <strong>{data.briefing.changed_count}</strong>
              </div>
              <div className="briefing-metric">
                <span className="briefing-metric-label">To fill in</span>
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
              See what's new
            </button>
            <button className="secondary-button" onClick={() => jumpToSection('dashboard-changed-findings')}>
              See what changed
            </button>
            <button className="secondary-button" onClick={() => jumpToSection('dashboard-blockers')}>
              See what's missing
            </button>
          </div>
        </Card>
      )}

      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          {data.briefing.sections.map((section) => (
            <BriefingSection
              key={section.key}
              section={section}
              anchorId={`dashboard-${section.key.replace(/_/g, '-')}`}
              onAction={handleFindingAction}
              pendingId={pendingFindingId}
            />
          ))}
        </div>

        <div className="dashboard-side-column">
          <Card
            title="Check status"
            description="How often Firstlight checks, and details of the most recent check."
            className="side-panel-card"
          >
            {data.latest_run ? (
              <div className="detail-grid">
                <div>
                  <strong>Last check</strong>
                  <div>{new Date(data.latest_run.started_at).toLocaleString()}</div>
                </div>
                <div>
                  <strong>Status</strong>
                  <div>{data.latest_run.status}</div>
                </div>
                <div>
                  <strong>Started by</strong>
                  <div>{data.latest_run.triggered_by}</div>
                </div>
                <div>
                  <strong>Next automatic check while open</strong>
                  <div>{data.next_scheduled_run ? new Date(data.next_scheduled_run).toLocaleString() : 'Not scheduled'}</div>
                </div>
              </div>
            ) : (
              <EmptyState title="No checks yet" message="Use the button above to run your first check." />
            )}
          </Card>

          <div id="dashboard-blockers">
            <BriefingBlockers blockers={data.briefing.blockers} />
          </div>

          <Card
            title="Questions for the doctor"
            description="Plain prompts you can bring to a visit. These are conversation starters, not medical advice."
            className="side-panel-card"
          >
            {suggestedQuestions.length === 0 ? (
              <EmptyState title="No questions yet" message="Run a check to generate source-backed questions to ask." />
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
            title="Where we looked"
            description="Each source Firstlight checked in the most recent run, and whether it responded."
            className="side-panel-card"
          >
            {sourceStatuses.length === 0 ? (
              <EmptyState title="Nothing checked yet" message="Run a check to see how each source responded." />
            ) : (
              <div className="headline-list">
                {sourceStatuses.map((source) => (
                  <article className="headline-item" key={source.connector_key}>
                    <strong>{friendlySourceName(source.connector_key)}</strong>
                    <div className={source.status === 'ok' ? 'muted' : 'callout callout-danger'}>
                      {source.status === 'ok' ? 'Responded' : 'Had trouble'} • {source.retrieved} found
                      {source.message ? ` • ${source.message}` : ''}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>

          <Card title="Recently found" description="A quick glance at the latest items Firstlight stored." className="side-panel-card">
            {data.recent_findings.length === 0 ? (
              <EmptyState title="Nothing found yet" message="Once a check finishes, items will appear here." />
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
