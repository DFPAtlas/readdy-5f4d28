import { Link } from 'react-router-dom';

export default function StaffDashboard() {
  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground-950">Staff Dashboard</h1>
        <p className="mt-1 text-sm text-foreground-600">Welcome to the DFP staff command centre.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Link
          to="/staff/uat-agent"
          className="block p-5 rounded-lg border border-background-200/70 bg-white hover:border-primary-300 transition-colors cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-lg bg-primary-100/70 flex items-center justify-center mb-3">
            <i className="ri-shield-check-line text-primary-600 text-lg" />
          </div>
          <h3 className="text-sm font-semibold text-foreground-950 whitespace-nowrap">AI UAT Agent</h3>
          <p className="mt-1 text-xs text-foreground-600">
            Run browser-based user acceptance tests, review evidence and decide release readiness.
          </p>
          <span className="inline-block mt-3 text-xs font-medium text-primary-600 group-hover:text-primary-700 whitespace-nowrap">
            Open &rarr;
          </span>
        </Link>
      </div>
    </div>
  );
}