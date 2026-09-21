import { useCallback, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.76 23.76 0 0118 11.25c-2.572 0-4.585.31-6.534.935l.554.905c.592.958.406 2.202-.408 2.926l-.554.905C12.81 15.225 11.54 15.58 10.25 15.58c-1.29 0-2.56-.355-3.7-.98l-.554-.905c-.814-.724-.998-1.968-.408-2.926l.554-.905C5.52 11.56 5.21 11.25 3.75 11.25a23.76 23.76 0 00-3.75 2.005zM12 14l-4 4c-.35-.27-.64-.6-.9-.95-.53-.66-.92-1.45-.92-2.32 0-.87.39-1.66.92-2.32.26-.35.55-.68.9-.95l4-4c.44.34.82.77 1.13 1.31l-3.5 5.25c-.12.18-.19.38-.19.59 0 .83.35 1.61.92 2.24.16.19.37.35.63.47l3.5-5.25c.31-.54.69-1 .93-1.31zM12 14v8m-4-4l4 4 4-4" />
                </svg>
              </div>
              <Link to="/" className="text-lg font-semibold text-gray-900 hover:text-primary-600 transition">
                Job Tracker
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
              <Link
                to="/board"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/board') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Board
              </Link>
              <Link
                to="/analytics"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/analytics') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Analytics
              </Link>
              <Link
                to="/reminders"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/reminders') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Reminders
              </Link>
              <Link
                to="/search"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/search') ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                Search
              </Link>
            </nav>

            <div className="flex items-center gap-2">
              {/* Mobile menu button */}
              <button
                onClick={() => setMobileNavOpen(!mobileNavOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition"
                aria-label="Toggle navigation"
                aria-expanded={mobileNavOpen}
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileNavOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
                </svg>
              </button>

              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="User menu"
                >
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-semibold text-sm">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.name}</span>
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-50" role="menu">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                        <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                      </div>
                      <div className="border-t border-gray-100 md:hidden">
                        <Link
                          to="/board"
                          className="block w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition"
                          onClick={() => setMenuOpen(false)}
                        >
                          Board
                        </Link>
                      </div>
                      <div className="border-t border-gray-100">
                        <Link
                          to="/analytics"
                          className="block w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition"
                          onClick={() => setMenuOpen(false)}
                        >
                          Analytics
                        </Link>
                        <Link
                          to="/reminders"
                          className="block w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition"
                          onClick={() => setMenuOpen(false)}
                        >
                          Reminders
                        </Link>
                        <Link
                          to="/search"
                          className="block w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition"
                          onClick={() => setMenuOpen(false)}
                        >
                          Search
                        </Link>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition"
                        role="menuitem"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          {mobileNavOpen && (
            <div className="md:hidden py-3 border-t border-gray-200">
              <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
                <Link
                  to="/board"
                  onClick={() => setMobileNavOpen(false)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium ${isActive('/board') ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  Board
                </Link>
                <Link
                  to="/analytics"
                  onClick={() => setMobileNavOpen(false)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium ${isActive('/analytics') ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  Analytics
                </Link>
                <Link
                  to="/reminders"
                  onClick={() => setMobileNavOpen(false)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium ${isActive('/reminders') ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  Reminders
                </Link>
                <Link
                  to="/search"
                  onClick={() => setMobileNavOpen(false)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium ${isActive('/search') ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  Search
                </Link>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-gray-400">
          Job Tracker &mdash; built with React, Express &amp; Prisma
        </div>
      </footer>
    </div>
  );
}
