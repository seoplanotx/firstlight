import { useCallback, useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { api } from '../lib/api';
import { formatAuditAction, formatAuditTimestamp } from '../lib/audit';
import { getErrorMessage } from '../lib/errors';
import type { AuditEvent, BootstrapInfo } from '../lib/types';

type SupportPageProps = {
  bootstrap: BootstrapInfo;
};

export function SupportPage({ bootstrap }: SupportPageProps) {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    try {
      const result = await api.getAuditLog();
      setAuditEvents(result.events);
      setAuditError(null);
    } catch (error) {
      setAuditError(getErrorMessage(error, 'Unknown error'));
    }
  }, []);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const handleExport = useCallback(async () => {
    setBusy('export');
    setStatusMessage(null);
    try {
      const blob = await api.exportAllData();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `oncowatch-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatusMessage('Your data was exported to a local JSON file.');
      void loadAudit();
    } catch (error) {
      setStatusMessage(getErrorMessage(error, 'Could not export your data.'));
    } finally {
      setBusy(null);
    }
  }, [loadAudit]);

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(
      'Permanently delete all local profiles, findings, monitoring runs, and reports? This cannot be undone. ' +
        'Consider exporting your data first.'
    );
    if (!confirmed) {
      return;
    }
    setBusy('delete');
    setStatusMessage(null);
    try {
      const summary = await api.deleteAllData();
      setStatusMessage(
        `Deleted ${summary.profiles} profile(s), ${summary.findings} finding(s), and ${summary.reports} report(s).`
      );
      void loadAudit();
    } catch (error) {
      setStatusMessage(getErrorMessage(error, 'Could not delete your data.'));
    } finally {
      setBusy(null);
    }
  }, [loadAudit]);

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">About and support</div>
          <h1>About / Support</h1>
          <p className="page-lede">
            Local product details, storage locations, privacy notes, your data controls, and the quickest recovery
            steps if something goes wrong.
          </p>
        </div>
      </div>

      <Card title="Release details" description="The public release stays narrow and truthful.">
        <div className="detail-grid">
          <div>
            <strong>Version</strong>
            <div>{bootstrap.app_version}</div>
          </div>
          <div>
            <strong>Scope</strong>
            <div>{bootstrap.product_scope}</div>
          </div>
          <div>
            <strong>Monitoring mode</strong>
            <div>{bootstrap.monitoring_mode === 'while_open' ? 'Automatic runs while the app is open' : bootstrap.monitoring_mode}</div>
          </div>
          <div>
            <strong>Privacy</strong>
            <div>{bootstrap.privacy_summary}</div>
          </div>
        </div>
      </Card>

      <Card
        title="What Firstlight is — and isn't"
        description="Please read this before relying on anything Firstlight surfaces."
      >
        <div className="stack">
          <p>
            Firstlight is an information monitoring and summarization tool. It searches public sources, matches them to
            the profile you enter, and produces source-backed briefings to bring to your oncology team.
          </p>
          <p className="muted">
            Firstlight is <strong>not</strong> a medical device, a diagnostic system, or a substitute for an oncologist.
            It does not determine treatment, trial eligibility, or medical appropriateness. Every finding requires review
            by a licensed clinician. Identifying details are encrypted on this device and never leave it unless you
            explicitly enable de-identified AI assistance.
          </p>
        </div>
      </Card>

      <Card title="Local storage" description="These folders matter for support, debugging, and manual recovery.">
        <div className="detail-grid support-path-grid">
          <div>
            <strong>Data</strong>
            <div className="support-path">{bootstrap.data_dir}</div>
          </div>
          <div>
            <strong>Reports</strong>
            <div className="support-path">{bootstrap.reports_dir}</div>
          </div>
          <div>
            <strong>Logs</strong>
            <div className="support-path">{bootstrap.logs_dir}</div>
          </div>
          <div>
            <strong>Config</strong>
            <div className="support-path">{bootstrap.config_dir}</div>
          </div>
        </div>
      </Card>

      <Card
        title="Your data"
        description="Identifying details are encrypted on this device. Export a portable copy or permanently delete everything."
      >
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={handleExport} disabled={busy !== null}>
            {busy === 'export' ? 'Exporting…' : 'Export my data'}
          </button>
          <button type="button" className="ghost-button" onClick={handleDelete} disabled={busy !== null}>
            {busy === 'delete' ? 'Deleting…' : 'Delete all my data'}
          </button>
        </div>
        {statusMessage ? (
          <p className="muted" role="status">
            {statusMessage}
          </p>
        ) : null}
      </Card>

      <Card title="Activity log" description="A local, append-only record of data-affecting actions on this device.">
        {auditError ? (
          <p className="muted" role="alert">
            Could not load the activity log: {auditError}
          </p>
        ) : auditEvents.length === 0 ? (
          <EmptyState title="No activity yet" message="Actions like profile edits, monitoring runs, and exports will appear here." />
        ) : (
          <ul className="audit-list">
            {auditEvents.map((event, index) => (
              <li key={`${event.timestamp}-${index}`} className="audit-item">
                <span className="audit-action">{formatAuditAction(event.action)}</span>
                <span className="muted audit-time">{formatAuditTimestamp(event.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recovery steps" description="Use these steps before reinstalling the app.">
        <div className="stack">
          <div className="support-step">
            <strong>1. Retry startup or reopen Firstlight.</strong>
            <div className="muted">The local backend may need a second launch window after an update or crash.</div>
          </div>
          <div className="support-step">
            <strong>2. Review the local log folder.</strong>
            <div className="muted">
              Open the logs path above and inspect the newest `oncowatch.log` entries for backend startup or connector
              failures.
            </div>
          </div>
          <div className="support-step">
            <strong>3. Back up your data folder before any reset.</strong>
            <div className="muted">
              Copy the data directory to a safe location before deleting app data, especially if you want to preserve
              profiles or reports.
            </div>
          </div>
          <div className="support-step">
            <strong>4. Reset only as a last resort.</strong>
            <div className="muted">
              Quit the app, back up the data and config folders, then remove them only if you need a clean first-launch
              state.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
