import { Link } from 'react-router-dom';

import { ClinicianSummaryPage } from './ClinicianSummaryPage';
import { ReportsPage } from './ReportsPage';
import { SavedForDiscussionPage } from './SavedForDiscussionPage';

export type DoctorVisitTab = 'saved' | 'summary' | 'reports';

// Visit prep in reading order: gather the shortlist, shape the summary,
// print the report.
const TABS: { key: DoctorVisitTab; label: string; to: string }[] = [
  { key: 'saved', label: 'Saved for Discussion', to: '/saved-findings' },
  { key: 'summary', label: 'Questions & summary', to: '/clinician' },
  { key: 'reports', label: 'Printable reports', to: '/reports' }
];

export function DoctorVisitPage({ activeTab }: { activeTab: DoctorVisitTab }) {
  return (
    <div className="page-stack">
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

      {activeTab === 'saved' && <SavedForDiscussionPage />}
      {activeTab === 'summary' && <ClinicianSummaryPage />}
      {activeTab === 'reports' && <ReportsPage />}
    </div>
  );
}
