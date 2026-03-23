import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ROLE_HIERARCHY = {
  super_admin: 50,
  hr: 40,
  bda: 30,
  trainer: 20,
  student: 10,
};

const STUDENT_ALLOWED_PREFIXES = ['/courses', '/progress', '/tasks', '/invoices', '/dashboard'];

const ProtectedRoute = ({ allowedRoles = [] }) => {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div>Loading session...</div>;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const { role } = user;
  const path = location.pathname;

  if (path.startsWith('/admin') && role !== 'super_admin') {
    console.warn('[Toast] Access Denied: Admin area only.');
    return <Navigate to="/dashboard" replace />;
  }

  if (role === 'student') {
    const isAllowed = STUDENT_ALLOWED_PREFIXES.some(prefix => path.startsWith(prefix));
    if (!isAllowed) {
      console.warn(`[Toast] Access Denied: Student cannot access ${path}`);
      return <Navigate to="/dashboard" replace />;
    }
  }

  if (allowedRoles.length > 0) {
    const userLevel = ROLE_HIERARCHY[role] || 0;
    const hasPermission = allowedRoles.some(allowedRole => {
      const requiredLevel = ROLE_HIERARCHY[allowedRole] || 0;
      return userLevel >= requiredLevel;
    });

    if (!hasPermission) {
      console.warn('[Toast] Access Denied: Insufficient permissions.');
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <Outlet />;
};

export default ProtectedRoute;
