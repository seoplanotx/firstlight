import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { api } from '../lib/api';
import type { PatientProfile } from '../lib/types';

const primaryItems = [
  { to: '/', label: 'Today' },
  { to: '/findings', label: "What's New" },
  { to: '/trials', label: 'Trials to Consider' },
  { to: '/updates', label: 'Research Updates' },
  { to: '/clinician', label: 'Summary for the Doctor' },
  { to: '/reports', label: 'Printable Reports' }
];

const secondaryItems = [
  { to: '/profile', label: 'Patient Details' },
  { to: '/settings', label: 'Settings' },
  { to: '/support', label: 'About / Help' }
];

export function Sidebar() {
  const [profiles, setProfiles] = useState<PatientProfile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadProfiles() {
    try {
      const [all, active] = await Promise.all([api.getProfiles(), api.getActiveProfile()]);
      setProfiles(all);
      setActiveId(active?.id ?? null);
    } catch {
      // Sidebar still works without multi-profile data.
    }
  }

  useEffect(() => {
    void loadProfiles();
  }, []);

  async function handleActivate(profileId: number) {
    if (profileId === activeId) return;
    setBusy(true);
    try {
      const activated = await api.activateProfile(profileId);
      setActiveId(activated.id ?? profileId);
      // Soft refresh for pages that load active profile on mount.
      window.dispatchEvent(new Event('firstlight:profile-changed'));
    } catch {
      // leave selection unchanged
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-panel">
        <div className="sidebar-brand">
          <span className="wordmark">Firstlight</span>
          <div className="wordmark-sub">Local oncology monitoring</div>
        </div>

        {profiles.length > 0 && (
          <div className="sidebar-nav-group">
            <div className="sidebar-section-label">Active profile</div>
            <label className="sidebar-profile-select">
              <span className="visually-hidden">Active patient profile</span>
              <select
                value={activeId ?? ''}
                disabled={busy || profiles.length === 0}
                onChange={(e) => void handleActivate(Number(e.target.value))}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name || profile.profile_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="muted sidebar-profile-hint">Switch who Firstlight is monitoring. Data stays on this computer.</div>
          </div>
        )}

        <div className="sidebar-nav-group">
          <div className="sidebar-section-label">Each day</div>
          <nav className="sidebar-nav">
            {primaryItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-nav-group">
          <div className="sidebar-section-label">Configure</div>
          <nav className="sidebar-nav">
            {secondaryItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-trust">
          <div className="sidebar-trust-label">Your privacy</div>
          <p className="sidebar-trust-copy">
            Everything stays on this computer. What Firstlight finds is information to review with your care team — never
            medical advice.
          </p>
        </div>
      </div>
    </aside>
  );
}
