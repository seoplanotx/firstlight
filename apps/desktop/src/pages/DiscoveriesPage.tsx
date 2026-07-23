import { Link } from 'react-router-dom';

import { FindingsPage } from './FindingsPage';
import { TrialMatchesPage } from './TrialMatchesPage';
import { UpdatesPage } from './UpdatesPage';

export type DiscoveriesTab = 'all' | 'trials' | 'research';

// Content types only. The Saved for Discussion shortlist lives under
// Doctor Visit — saving during review feeds visit prep, not another tab here.
const TABS: { key: DiscoveriesTab; label: string; to: string }[] = [
  { key: 'all', label: "What's new", to: '/discoveries' },
  { key: 'trials', label: 'Trials', to: '/trials' },
  { key: 'research', label: 'Research', to: '/updates' }
];

export function DiscoveriesPage({ activeTab }: { activeTab: DiscoveriesTab }) {
  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <div className="eyebrow">Your daily check</div>
          <h1>Discoveries</h1>
          <p className="page-lede">
            Everything Firstlight found for the person you're monitoring — new findings to review, possible trials, and
            fresh research.
          </p>
        </div>
      </div>

      <nav className="section-tabs" aria-label="Discoveries views">
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

      {activeTab === 'all' && <FindingsPage embedded />}
      {activeTab === 'trials' && <TrialMatchesPage embedded />}
      {activeTab === 'research' && <UpdatesPage embedded />}
    </div>
  );
}
