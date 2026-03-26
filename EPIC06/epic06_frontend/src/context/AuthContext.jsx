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
      const response = await axiosInstance.get('/api/auth/me');
      setUser(response.data);
    } catch (error) {
      // Logic handled by axiosInstance interceptors (redirect to login if refresh fails)
      setUser(null);
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
      {children}
    </AuthContext.Provider>
  );
};
