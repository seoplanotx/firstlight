import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { PROFILE_CHANGED_EVENT } from '../lib/profileEditGuard';
import { Sidebar } from './Sidebar';

const SELF_REFRESHING_PATHS = new Set(['/profile', '/support']);

type LayoutProps = {
  children: ReactNode;
  disclaimer?: string;
};

const defaultDisclaimer =
  'Firstlight is an information monitoring and summarization tool. It does not determine treatment, trial eligibility, or medical appropriateness. All findings should be reviewed with a licensed oncology team.';

export function Layout({ children, disclaimer = defaultDisclaimer }: LayoutProps) {
  const mainRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const [profileEpoch, setProfileEpoch] = useState(0);

  // Pages load the active profile's data once on mount. When the active
  // profile changes (sidebar switcher, Patient Details), remount the current
  // page so it can never keep showing the previous person's findings or
  // reports.
  useEffect(() => {
    const bump = () => setProfileEpoch((value) => value + 1);
    window.addEventListener(PROFILE_CHANGED_EVENT, bump);
    return () => window.removeEventListener(PROFILE_CHANGED_EVENT, bump);
  }, []);
  // Patient Details reloads itself, and About/Support must keep its
  // "deleted N profiles" confirmation, so neither is remounted.
  const pageKey = SELF_REFRESHING_PATHS.has(location.pathname) ? location.pathname : `profile-epoch-${profileEpoch}`;

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
        <div className="page-content" key={pageKey}>
          {children}
        </div>
        <footer className="footer-note">
          <span className="footer-disclaimer">{disclaimer}</span>
          <span>Automatic runs happen only while Firstlight is open.</span>
        </footer>
      </main>
    </div>
  );
}
