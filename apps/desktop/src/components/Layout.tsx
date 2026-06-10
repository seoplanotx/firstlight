import type { ReactNode } from 'react';

import { Sidebar } from './Sidebar';

type LayoutProps = {
  children: ReactNode;
  disclaimer?: string;
};

const defaultDisclaimer =
  'Firstlight is an information monitoring and summarization tool. It does not determine treatment, trial eligibility, or medical appropriateness. All findings should be reviewed with a licensed oncology team.';

export function Layout({ children, disclaimer = defaultDisclaimer }: LayoutProps) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <div className="page-content">{children}</div>
        <footer className="footer-note">
          <span className="footer-disclaimer">{disclaimer}</span>
          <span>Automatic runs happen only while Firstlight is open.</span>
        </footer>
      </main>
    </div>
  );
}
