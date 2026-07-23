import { Link } from 'react-router-dom';

import { ClinicianSummaryPage } from './ClinicianSummaryPage';
import { ReportsPage } from './ReportsPage';
import { SavedForDiscussionPage } from './SavedForDiscussionPage';

export type DoctorVisitTab = 'saved' | 'summary' | 'reports';

// Visit prep in reading order: gather the shortlist, shape the summary,
// print the report.
const TABS: { key: DoctorVisitTab; label: string; to: string }[] = [
  { key: 'saved', label: 'Saved for discussion', to: '/saved-findings' },
  { key: 'summary', label: 'For your doctor', to: '/clinician' },
  { key: 'reports', label: 'Reports', to: '/reports' }
];

export function DoctorVisitPage({ activeTab }: { activeTab: DoctorVisitTab }) {
  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Bring it to your team</div>
          <h1>Doctor Visit</h1>
          <p className="page-lede">
            Everything for the next appointment in one place — your shortlist, a summary for the doctor, and printable
            reports.
          </p>
        </div>
      </div>

      <nav className="section-tabs" aria-label="Doctor visit views">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.to}
            className={activeTab === tab.key ? 'section-tab active' : 'section-tab'}
            aria-current={activeTab === tab.key ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {activeTab === 'saved' && <SavedForDiscussionPage embedded />}
      {activeTab === 'summary' && <ClinicianSummaryPage embedded />}
      {activeTab === 'reports' && <ReportsPage embedded />}
    </div>
  );
}
