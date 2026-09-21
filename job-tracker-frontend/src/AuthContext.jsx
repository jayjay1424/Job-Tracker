import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = useCallback(async (email, password) => {
    const { user } = await api.login({ email, password });
    setUser(user);
    navigate('/board', { replace: true });
    return user;
  }, [navigate]);

  const signup = useCallback(async (name, email, password) => {
    const { user } = await api.signup({ name, email, password });
    setUser(user);
    navigate('/board', { replace: true });
    return user;
  }, [navigate]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch (e) {
      // ignore network error, still clear local state
      console.warn('Logout failed', e?.message);
    } finally {
      setUser(null);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
