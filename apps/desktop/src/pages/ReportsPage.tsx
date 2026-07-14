import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PageErrorState } from '../components/PageErrorState';
import { api } from '../lib/api';
import { getErrorMessage } from '../lib/errors';
import { fileDirectory, openLocalPath } from '../lib/external';
import type { ClinicianSummary, Finding, ReportExport, ReportType } from '../lib/types';

const REPORT_TYPE_LABELS: Record<string, string> = {
  daily_summary: 'Daily Summary Report',
  full_review: 'Full Oncology Review Report',
  appointment_prep: 'Appointment Prep Sheet'
};

function reportTypeLabel(reportType: string): string {
  return REPORT_TYPE_LABELS[reportType] || 'Full Oncology Review Report';
}

// Lead with intent — what the family is preparing for — mapped onto the existing
// three report types. No change to report generation itself.
const INTENTS: { key: ReportType; title: string; detail: string }[] = [
  {
    key: 'appointment_prep',
    title: 'An upcoming appointment',
    detail: 'A focused one-page sheet to bring to a visit — the saved findings and questions in one place.'
  },
  {
    key: 'daily_summary',
    title: 'A quick update to share',
    detail: 'A short summary of what is new, easy to email or hand to someone on the care team.'
  },
  {
    key: 'full_review',
    title: 'A comprehensive review',
    detail: 'Everything Firstlight has gathered, with an evidence appendix, for a thorough read.'
  }
];

const APPOINTMENT_KEY = 'firstlight.appointmentPrep';

type Appointment = { date: string; doctor: string };

function readAppointment(): Appointment {
  try {
    const raw = window.localStorage.getItem(APPOINTMENT_KEY);
    if (!raw) return { date: '', doctor: '' };
    const parsed = JSON.parse(raw) as Partial<Appointment>;
    return { date: typeof parsed.date === 'string' ? parsed.date : '', doctor: typeof parsed.doctor === 'string' ? parsed.doctor : '' };
  } catch {
    return { date: '', doctor: '' };
  }
}

// Which key profile details are still empty — used both to acknowledge gaps
// before generating and to phrase the readiness summary afterward.
function missingProfileDetails(summary: ClinicianSummary | null): string[] {
  if (!summary) return [];
  const header = summary.case_header;
  const missing: string[] = [];
  if (header.lines_of_therapy.length === 0) missing.push('Treatment line');
  if (header.biomarkers.length === 0) missing.push('Biomarkers');
  if (!header.stage_or_context) missing.push('Stage');
  return missing;
}

type Phase = 'choose' | 'prep' | 'done';

export function ReportsPage() {
  const [reports, setReports] = useState<ReportExport[]>([]);
  const [summary, setSummary] = useState<ClinicianSummary | null>(null);
  const [savedFindings, setSavedFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const [phase, setPhase] = useState<Phase>('choose');
  const [intent, setIntent] = useState<ReportType | null>(null);
  const [appointment, setAppointment] = useState<Appointment>(readAppointment);
  const [lastGenerated, setLastGenerated] = useState<ReportExport | null>(null);

  async function load() {
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await api.getReports();
      setReports(result);
      // Findings and the clinician summary drive the guided prep; they are
      // best-effort so the page still works before a profile or run exists.
      try {
        const [findingsResult, clinicianSummary] = await Promise.all([api.getFindings(), api.getClinicianSummary()]);
        setSavedFindings(findingsResult.items.filter((item) => item.user_action === 'discuss'));
        setSummary(clinicianSummary);
      } catch {
        // Prep still renders with whatever loaded.
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not load local reports.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(APPOINTMENT_KEY, JSON.stringify(appointment));
    } catch {
      // best-effort
    }
  }, [appointment]);

  function startIntent(next: ReportType) {
    setIntent(next);
    setPhase('prep');
    setNotice('');
    setErrorMessage('');
  }

  async function generate() {
    if (!intent) return;
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const result = await api.generateReport({ report_type: intent });
      setLastGenerated(result);
      setPhase('done');
      await load();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not generate the report.'));
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(reportType: string) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      await api.generateReport({ report_type: reportType });
      setNotice(`${reportTypeLabel(reportType)} updated locally.`);
      await load();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not generate the report.'));
    } finally {
      setBusy(false);
    }
  }

  async function openLocation(report: ReportExport) {
    setErrorMessage('');
    setNotice('');
    const opened = await openLocalPath(fileDirectory(report.file_path));
    if (!opened) {
      setNotice(`Saved on this computer at: ${report.file_path}`);
    }
  }

  async function download(reportId: number, reportType: string) {
    setErrorMessage('');
    setNotice('');
    try {
      const blob = await api.downloadReport(reportId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `firstlight-${reportType}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      setNotice('PDF download started.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Could not download the PDF.'));
    }
  }

  const questions = summary?.discussion_questions ?? [];
  const missingDetails = useMemo(() => missingProfileDetails(summary), [summary]);
  const intentLabel = intent ? reportTypeLabel(intent) : '';

  const readiness = useMemo(() => {
    const parts = [
      `Includes ${savedFindings.length} saved ${savedFindings.length === 1 ? 'finding' : 'findings'} and ${questions.length} ${questions.length === 1 ? 'question' : 'questions'}.`
    ];
    if (missingDetails.length > 0) {
      parts.push(
        `${missingDetails.join(', ')} ${missingDetails.length === 1 ? 'is' : 'are'} still missing and may affect trial matching.`
      );
    }
    return parts.join(' ');
  }, [savedFindings.length, questions.length, missingDetails]);

  if (loading) return <div className="loading-block">Loading reports...</div>;
  if (errorMessage && reports.length === 0 && phase === 'choose') {
    return <PageErrorState title="Reports unavailable" message={errorMessage} onRetry={load} />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Generated on this computer</div>
          <h1>Reports</h1>
          <p className="page-lede">
            Start with what you are preparing for. Firstlight builds a clean PDF from your saved findings and questions,
            all on this computer.
          </p>
        </div>
      </div>

      {notice && <div className="callout">{notice}</div>}
      {errorMessage && <div className="callout callout-danger">{errorMessage}</div>}

      {phase === 'choose' && (
        <Card title="What are you preparing for?" description="Pick one to start — you can review everything before it is created.">
          <div className="intent-grid">
            {INTENTS.map((option) => (
              <button key={option.key} type="button" className="intent-card" onClick={() => startIntent(option.key)}>
                <strong className="intent-card-title">{option.title}</strong>
                <span className="intent-card-detail">{option.detail}</span>
                <span className="intent-card-cue" aria-hidden="true">
                  Choose
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {phase === 'prep' && intent && (
        <Card
          title={`Getting ready: ${intentLabel}`}
          description="A quick look at what will be included before Firstlight creates the PDF."
        >
          <div className="stack">
            {intent === 'appointment_prep' && (
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="appt-date">Appointment date (optional)</label>
                  <input
                    id="appt-date"
                    type="date"
                    value={appointment.date}
                    onChange={(e) => setAppointment((current) => ({ ...current, date: e.target.value }))}
                  />
                  <div className="field-hint">Stored on this computer, just for your reference.</div>
                </div>
                <div className="field">
                  <label htmlFor="appt-doctor">Doctor or clinic (optional)</label>
                  <input
                    id="appt-doctor"
                    value={appointment.doctor}
                    onChange={(e) => setAppointment((current) => ({ ...current, doctor: e.target.value }))}
                    placeholder="e.g. Dr. Rivera"
                  />
                  <div className="field-hint">Stored on this computer, just for your reference.</div>
                </div>
              </div>
            )}

            <div className="prep-section">
              <div className="prep-section-head">
                <strong>Findings you saved to discuss</strong>
                <span className="section-counter">{savedFindings.length} included</span>
              </div>
              {savedFindings.length === 0 ? (
                <p className="muted">
                  You have not saved any findings yet. You can still create the report, or go to{' '}
                  <Link to="/discoveries">Discoveries</Link> to save the ones worth raising.
                </p>
              ) : (
                <ul className="prep-list">
                  {savedFindings.map((item) => (
                    <li key={item.id}>{item.title}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="prep-section">
              <div className="prep-section-head">
                <strong>Questions to bring</strong>
                <span className="section-counter">{questions.length} suggested</span>
              </div>
              {questions.length === 0 ? (
                <p className="muted">No suggested questions yet. Run a check to generate source-backed questions.</p>
              ) : (
                <ul className="prep-list">
                  {questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              )}
            </div>

            {missingDetails.length > 0 && (
              <div className="callout">
                <strong>A heads-up before you generate.</strong> {missingDetails.join(', ')}{' '}
                {missingDetails.length === 1 ? 'is' : 'are'} not filled in yet, which may affect trial matching. You can
                add {missingDetails.length === 1 ? 'it' : 'them'} in <Link to="/profile">Patient Details</Link>, or
                continue without.
              </div>
            )}

            <div className="button-row">
              <button className="ghost-button" type="button" onClick={() => setPhase('choose')}>
                Back
              </button>
              <button className="primary-button" type="button" disabled={busy} onClick={() => void generate()}>
                {busy ? 'Creating…' : `Create ${intentLabel}`}
              </button>
            </div>
          </div>
        </Card>
      )}

      {phase === 'done' && lastGenerated && (
        <Card title="Your report is ready" description="Created on this computer and added to your history below.">
          <div className="stack">
            <div className="report-ready">
              <strong>{reportTypeLabel(lastGenerated.report_type)}</strong>
              <p className="muted">{readiness}</p>
              {intent === 'appointment_prep' && (appointment.date || appointment.doctor) && (
                <p className="muted">
                  For your appointment
                  {appointment.doctor ? ` with ${appointment.doctor}` : ''}
                  {appointment.date ? ` on ${new Date(appointment.date).toLocaleDateString()}` : ''}.
                </p>
              )}
            </div>
            <div className="button-row">
              <button
                className="primary-button"
                type="button"
                onClick={() => void download(lastGenerated.id, lastGenerated.report_type)}
              >
                Download PDF
              </button>
              <button className="secondary-button" type="button" onClick={() => void openLocation(lastGenerated)}>
                Open file location
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setPhase('choose');
                  setIntent(null);
                  setLastGenerated(null);
                }}
              >
                Prepare another
              </button>
            </div>
          </div>
        </Card>
      )}

      <Card title="Report history" description="Reports you have made on this computer. Open, save, or refresh any of them.">
        {reports.length === 0 ? (
          <EmptyState title="No reports yet" message="Start above to create your first report." />
        ) : (
          <div className="finding-list">
            {reports.map((report) => (
              <article className="finding-item" key={report.id}>
                <div className="finding-topline">
                  <div>
                    <strong>{reportTypeLabel(report.report_type)}</strong>
                    <div className="muted">{new Date(report.generated_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className="finding-footer">
                  <div className="finding-actions">
                    <button className="secondary-button" onClick={() => void download(report.id, report.report_type)}>
                      Download PDF
                    </button>
                    <button className="ghost-button" onClick={() => void openLocation(report)}>
                      Open file location
                    </button>
                    <button className="ghost-button" disabled={busy} onClick={() => void regenerate(report.report_type)}>
                      Generate updated version
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
