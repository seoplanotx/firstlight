import type { ReactNode } from 'react';

import { DisclaimerBanner } from './DisclaimerBanner';
import { Sidebar } from './Sidebar';

type LayoutProps = {
  children: ReactNode;
  disclaimer?: string;
};

export function Layout({ children, disclaimer }: LayoutProps) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <header className="topbar">
          <div className="topbar-copy">
            <span className="topbar-eyebrow">Local-first oncology briefings</span>
            <span className="topbar-text">
              Structured questions and source-backed notes, prepared for clinician review.
            </span>
          </div>
          <DisclaimerBanner disclaimer={disclaimer} />
        </header>
        <div className="page-content">{children}</div>
        <footer className="footer-note">
          <span>Profiles, settings, reports, and logs stay on this device.</span>
          <span>Automatic runs happen only while Firstlight is open.</span>
        </footer>
      </main>
    </div>
  );
}
