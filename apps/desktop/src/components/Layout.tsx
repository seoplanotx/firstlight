import { useRef } from 'react';
import type { ReactNode } from 'react';

import { Sidebar } from './Sidebar';

type LayoutProps = {
  children: ReactNode;
  disclaimer?: string;
};

const defaultDisclaimer =
  'Firstlight is an information monitoring and summarization tool. It does not determine treatment, trial eligibility, or medical appropriateness. All findings should be reviewed with a licensed oncology team.';

export function Layout({ children, disclaimer = defaultDisclaimer }: LayoutProps) {
  const mainRef = useRef<HTMLElement | null>(null);

  return (
    <div className="app-shell">
      {/* The app uses a hash router, so a plain #main-content href would fight
          the router — move focus directly instead. */}
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to main content
      </a>
      <Sidebar />
      <main className="app-main" id="main-content" tabIndex={-1} ref={mainRef}>
        <div className="page-content">{children}</div>
        <footer className="footer-note">
          <span className="footer-disclaimer">{disclaimer}</span>
          <span>Automatic runs happen only while Firstlight is open.</span>
        </footer>
      </main>
    </div>
  );
}
