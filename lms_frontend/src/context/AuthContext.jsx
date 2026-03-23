import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import axiosInstance, { setAccessToken } from '../api/axiosInstance';

const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  loading: true,
  login: () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async () => {
    try {
      // 1. Call GET /api/auth/me with plain axios (no interceptor)
      const response = await axios.get(
        `${import.meta.env.VITE_API_URL || ''}/api/auth/me`,
        { withCredentials: true }
      );
      
      setUser(response.data);
    } catch (error) {
      // 2. If it returns 401 — just set user = null and stop (silent catch)
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const login = (userData, token) => {
    setAccessToken(token);
    setUser(userData);
  };

  const logout = async () => {
    try {
      await axiosInstance.post('/api/auth/logout');
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setAccessToken(null);
      setUser(null);
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
