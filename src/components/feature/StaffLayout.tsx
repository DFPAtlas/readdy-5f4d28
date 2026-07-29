import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const staffNavItems: NavItem[] = [
  { label: 'Dashboard', path: '/staff', icon: 'ri-dashboard-line' },
  { label: 'UAT Agent', path: '/staff/uat-agent', icon: 'ri-shield-check-line' },
];

export default function StaffLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/staff') return location.pathname === '/staff';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-screen bg-background-50">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-50 w-60 bg-white border-r border-background-200/70
          transform transition-transform duration-200 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 flex flex-col
        `}
      >
        {/* Logo area */}
        <div className="h-14 flex items-center px-5 border-b border-background-200/70">
          <span className="text-foreground-950 font-semibold text-sm tracking-wide whitespace-nowrap">DFP Staff</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {staffNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap
                transition-colors duration-150 cursor-pointer
                ${isActive(item.path)
                  ? 'bg-primary-100/70 text-primary-700'
                  : 'text-foreground-700 hover:bg-background-100 hover:text-foreground-950'
                }
              `}
            >
              <i className={`${item.icon} text-base w-5 h-5 flex items-center justify-center`} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-background-200/70">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs text-foreground-600 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center" />
            Back to Site
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-background-200/70 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-md hover:bg-background-100 transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              <i className="ri-menu-line text-lg" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-foreground-600">
              <div className="w-7 h-7 rounded-full bg-secondary-100 flex items-center justify-center">
                <i className="ri-user-line text-secondary-600 text-sm" />
              </div>
              <span className="hidden sm:inline whitespace-nowrap">Staff User</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}