import { NavLink } from 'react-router-dom';

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
  return (
    <aside className="sidebar">
      <div className="sidebar-panel">
        <div className="sidebar-brand">
          <span className="wordmark">Firstlight</span>
          <div className="wordmark-sub">Local oncology monitoring</div>
        </div>

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
