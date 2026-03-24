import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import MfaPage from './pages/MfaPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import BdaDashboardPage from './pages/bda/BdaDashboardPage';
import LeadsListPage from './pages/bda/LeadsListPage';
import NewLeadPage from './pages/bda/NewLeadPage';
import LeadDetailPage from './pages/bda/LeadDetailPage';
import ImportLeadsPage from './pages/bda/ImportLeadsPage';
import StudentDashboardPage from './pages/student/StudentDashboardPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { RegistrationsListPage } from './pages/RegistrationsListPage';
import GuestRegistrationPage from './pages/GuestRegistrationPage';
import PaymentPage from './pages/PaymentPage';
import StaffDashboardPage from './pages/StaffDashboardPage';
import { useAuth } from './context/AuthContext';

// EPIC-08: HR & Admin pages
import BatchListPage          from './pages/hr/BatchListPage';
import CreateBatchPage        from './pages/hr/CreateBatchPage';
import BatchDetailPage        from './pages/hr/BatchDetailPage';
import EnrollmentsPage        from './pages/hr/EnrollmentsPage';
import ReportsPage            from './pages/hr/ReportsPage';
import SystemSettingsPage     from './pages/admin/SystemSettingsPage';
import AnalyticsDashboardPage from './pages/admin/AnalyticsDashboardPage';

const DashboardSwitcher = () => {
  const { user } = useAuth();
  if (user?.role === 'student') return <StudentDashboardPage />;
  if (user?.role === 'super_admin' || user?.role === 'trainer') return <StaffDashboardPage />;
  return <BdaDashboardPage />;
};

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/mfa" element={<MfaPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/register" element={<GuestRegistrationPage />} />
          <Route path="/payment/:enrollmentId" element={<PaymentPage />} />

          {/* Default Redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardPage />}>
              <Route path="/dashboard"             element={<DashboardSwitcher />} />

              {/* BDA routes */}
              <Route path="/leads"                 element={<LeadsListPage />} />
              <Route path="/leads/new"             element={<NewLeadPage />} />
              <Route path="/leads/import"          element={<ImportLeadsPage />} />
              <Route path="/leads/:id"             element={<LeadDetailPage />} />

              {/* Student */}
              <Route path="/student/dashboard"     element={<StudentDashboardPage />} />

              {/* Registration */}
              <Route path="/registrations"               element={<RegistrationsListPage />} />
              <Route path="/registration/:id/edit"       element={<RegistrationPage editMode={true} />} />
              <Route path="/registration/new"            element={<RegistrationPage />} />

              {/* EPIC-08: HR routes */}
              <Route path="/batches"               element={<BatchListPage />} />
              <Route path="/batches/new"           element={<CreateBatchPage />} />
              <Route path="/batches/:id"           element={<BatchDetailPage />} />
              <Route path="/hr/enrollments"        element={<EnrollmentsPage />} />
              <Route path="/hr/reports"            element={<ReportsPage />} />

              {/* EPIC-08: Admin routes */}
              <Route path="/admin/settings"        element={<SystemSettingsPage />} />
              <Route path="/admin/analytics"       element={<AnalyticsDashboardPage />} />
            </Route>
          </Route>

          {/* Catch All */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
