import { useEffect, useMemo, useState } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Outlet, RouterProvider, createHashRouter } from 'react-router-dom';

import { Layout } from './components/Layout';
import { RecoveryScreen } from './components/RecoveryScreen';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { API_BASE, api } from './lib/api';
import { useBackgroundMonitoring } from './lib/backgroundMonitoring';
import { getErrorMessage } from './lib/errors';
import type { BootstrapInfo, OnboardingState } from './lib/types';
import { DashboardPage } from './pages/DashboardPage';
import { DiscoveriesPage } from './pages/DiscoveriesPage';
import { DoctorVisitPage } from './pages/DoctorVisitPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { SupportPage } from './pages/SupportPage';

// Task-based navigation. The nav shows four "Today / Discoveries / Doctor Visit"
// destinations, but every legacy URL still resolves — old routes render inside
// the consolidated parent with the matching tab already active, so existing
// links, bookmarks, and in-app navigation keep working.
export function appRouteChildren(bootstrap: BootstrapInfo): RouteObject[] {
  return [
    { index: true, element: <DashboardPage /> },
    { path: 'discoveries', element: <DiscoveriesPage activeTab="all" /> },
    { path: 'findings', element: <DiscoveriesPage activeTab="all" /> },
    { path: 'trials', element: <DiscoveriesPage activeTab="trials" /> },
    { path: 'updates', element: <DiscoveriesPage activeTab="research" /> },
    { path: 'saved-findings', element: <DoctorVisitPage activeTab="saved" /> },
    { path: 'doctor-visit', element: <DoctorVisitPage activeTab="summary" /> },
    { path: 'clinician', element: <DoctorVisitPage activeTab="summary" /> },
    { path: 'reports', element: <DoctorVisitPage activeTab="reports" /> },
    { path: 'profile', element: <ProfilePage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: 'support', element: <SupportPage bootstrap={bootstrap} /> }
  ];
}

const BOOT_ATTEMPTS = 6;
const BOOT_RETRY_DELAYS_MS = [250, 400, 650, 900, 1200];

function wait(delayMs: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapInfo | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [loadingLabel, setLoadingLabel] = useState('Starting local Firstlight services...');

  useBackgroundMonitoring();

  async function load() {
    setLoading(true);
    setBootError(null);

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= BOOT_ATTEMPTS; attempt += 1) {
      setLoadingLabel(
        attempt === 1
          ? 'Starting local Firstlight services...'
          : `Waiting for the local backend to start (${attempt}/${BOOT_ATTEMPTS})...`
      );
      try {
        const [bootstrapInfo, onboarding] = await Promise.all([api.getBootstrap(), api.getOnboardingState()]);
        setBootstrap(bootstrapInfo);
        setOnboardingState(onboarding);
        setLoading(false);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < BOOT_ATTEMPTS) {
          await wait(BOOT_RETRY_DELAYS_MS[Math.min(attempt - 1, BOOT_RETRY_DELAYS_MS.length - 1)]);
        }
      }
    }

    setBootstrap(null);
    setOnboardingState(null);
    setBootError(getErrorMessage(lastError, 'Firstlight could not reach its local backend.'));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading) {
    return <div className="app-loading" role="status">{loadingLabel}</div>;
  }

  if (bootError) {
    return <RecoveryScreen errorMessage={bootError} apiBase={API_BASE} onRetry={load} />;
  }

  if (!bootstrap || !onboardingState) {
    return <RecoveryScreen errorMessage="The local app did not initialize correctly." apiBase={API_BASE} onRetry={load} />;
  }

  if (!onboardingState.is_completed) {
    return <OnboardingWizard onCompleted={load} />;
  }

  return <MainRouter bootstrap={bootstrap} />;
}

// A data router (createHashRouter) so pages can use useBlocker to guard
// unsaved edits across every kind of navigation — sidebar links and the
// browser/webview Back/Forward controls alike.
function MainRouter({ bootstrap }: { bootstrap: BootstrapInfo }) {
  const router = useMemo(
    () =>
      createHashRouter([
        {
          element: (
            <Layout disclaimer={bootstrap.disclaimer}>
              <Outlet />
            </Layout>
          ),
          children: appRouteChildren(bootstrap)
        }
      ]),
    [bootstrap]
  );

  return <RouterProvider router={router} />;
}
