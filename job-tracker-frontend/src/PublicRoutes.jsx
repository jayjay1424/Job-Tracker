import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const AUTH_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password'];

export default function PublicRoutes() {
  const { loading, user } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-live="polite">
        <div className="spinner" aria-label="Loading" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  // If logged in, redirect away from auth pages
  if (user && AUTH_PATHS.includes(location.pathname)) {
    return <Navigate to="/board" replace />;
  }

  return <Outlet />;
}
