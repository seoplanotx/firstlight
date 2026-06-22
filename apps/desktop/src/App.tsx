import { useEffect, useMemo, useState } from 'react';
import { Outlet, RouterProvider, createHashRouter } from 'react-router-dom';

import { Layout } from './components/Layout';
import { RecoveryScreen } from './components/RecoveryScreen';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { API_BASE, api } from './lib/api';
import { useBackgroundMonitoring } from './lib/backgroundMonitoring';
import { getErrorMessage } from './lib/errors';
import type { BootstrapInfo, OnboardingState } from './lib/types';
import { ClinicianSummaryPage } from './pages/ClinicianSummaryPage';
import { DashboardPage } from './pages/DashboardPage';
import { FindingsPage } from './pages/FindingsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { SupportPage } from './pages/SupportPage';
import { TrialMatchesPage } from './pages/TrialMatchesPage';
import { UpdatesPage } from './pages/UpdatesPage';

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
    return <div className="app-loading">{loadingLabel}</div>;
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
          children: [
            { index: true, element: <DashboardPage /> },
            { path: 'profile', element: <ProfilePage /> },
            { path: 'findings', element: <FindingsPage /> },
            { path: 'trials', element: <TrialMatchesPage /> },
            { path: 'updates', element: <UpdatesPage /> },
            { path: 'clinician', element: <ClinicianSummaryPage /> },
            { path: 'reports', element: <ReportsPage /> },
            { path: 'settings', element: <SettingsPage /> },
            { path: 'support', element: <SupportPage bootstrap={bootstrap} /> }
          ]
        }
      ]),
    [bootstrap]
  );

  return <RouterProvider router={router} />;
}
