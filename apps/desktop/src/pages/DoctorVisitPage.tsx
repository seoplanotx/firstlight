import { Link } from 'react-router-dom';

import { ClinicianSummaryPage } from './ClinicianSummaryPage';
import { ReportsPage } from './ReportsPage';

export type DoctorVisitTab = 'summary' | 'reports';

const TABS: { key: DoctorVisitTab; label: string; to: string }[] = [
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

      {activeTab === 'summary' && <ClinicianSummaryPage />}
      {activeTab === 'reports' && <ReportsPage />}
    </div>
  );
}
