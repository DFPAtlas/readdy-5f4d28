import { Navigate } from 'react-router-dom';

// Simple auth guard — in production this would check Supabase auth
// For now, always allows access (mock mode)
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const isAuthenticated = true; // Mock: always authenticated
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}