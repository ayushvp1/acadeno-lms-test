import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import { RegistrationProvider } from './context/RegistrationContext';

import LoginPage from './pages/LoginPage';
import MfaPage from './pages/MfaPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { RegistrationsListPage } from './pages/RegistrationsListPage';

const App = () => {
  return (
    <AuthProvider>
      <RegistrationProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/mfa" element={<MfaPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            
            {/* Default Redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* General Dashboard (All roles) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>

            {/* EPIC-03: Registration Wizard (HR, BDA, Admin) */}
            <Route element={<ProtectedRoute allowedRoles={['hr', 'bda', 'super_admin']} />}>
              <Route path="/registration/new" element={<RegistrationPage />} />
              <Route path="/registration/:id/edit" element={<RegistrationPage editMode={true} />} />
              <Route path="/registrations" element={<RegistrationsListPage />} />
            </Route>
          
          {/* Catch All */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </RegistrationProvider>
    </AuthProvider>
  );
};

export default App;
