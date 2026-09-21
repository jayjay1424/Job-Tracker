import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Layout from './Layout';
import PublicRoutes from './PublicRoutes';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Board from './pages/Board';
import ApplicationDetail from './pages/ApplicationDetail';
import CreateApplication from './pages/CreateApplication';
import AnalyticsDashboard from './pages/AnalyticsDashboard';
import RemindersPage from './pages/RemindersPage';
import SearchPage from './pages/SearchPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="spinner" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public auth pages */}
          <Route element={<PublicRoutes />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>

          {/* Protected app pages */}
          <Route path="/" element={<Navigate to="/board" replace />} />
          <Route
            path="/board"
            element={
              <ProtectedRoute>
                <Layout>
                  <Board />
                </Layout>
              </ProtectedRoute>
            }
          />
          {/* Legacy redirect: old non-English route */}
          <Route path="/kanban" element={<Navigate to="/board" replace />} />
          <Route
            path="/applications/new"
            element={
              <ProtectedRoute>
                <Layout>
                  <CreateApplication />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <ApplicationDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/applications/:id/edit"
            element={
              <ProtectedRoute>
                <Layout>
                  <CreateApplication />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Layout>
                  <AnalyticsDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/reminders"
            element={
              <ProtectedRoute>
                <Layout>
                  <RemindersPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/search"
            element={
              <ProtectedRoute>
                <Layout>
                  <SearchPage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* 404 */}
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <Layout>
                  <div className="text-center py-20">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Page not found</h2>
                    <Link to="/board" className="text-primary-600 hover:underline">Go to Board</Link>
                  </div>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}