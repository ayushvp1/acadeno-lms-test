import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

<<<<<<< HEAD
=======
import { RegistrationProvider } from './context/RegistrationContext';

>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
import LoginPage from './pages/LoginPage';
import MfaPage from './pages/MfaPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
<<<<<<< HEAD
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

const DashboardSwitcher = () => {
    const { user } = useAuth();
    if (user?.role === 'student') return <StudentDashboardPage />;
    if (user?.role === 'super_admin' || user?.role === 'trainer') return <StaffDashboardPage />;
    return <BdaDashboardPage />;
};
=======
import { RegistrationPage } from './pages/RegistrationPage';
import { RegistrationsListPage } from './pages/RegistrationsListPage';
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906

const App = () => {
  return (
    <AuthProvider>
<<<<<<< HEAD
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

          {/* Protected Routes Wrapper */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardPage />}>
               <Route path="/dashboard" element={<DashboardSwitcher />} />
               <Route path="/leads" element={<LeadsListPage />} />
               <Route path="/leads/new" element={<NewLeadPage />} />
               <Route path="/leads/import" element={<ImportLeadsPage />} />
               <Route path="/leads/:id" element={<LeadDetailPage />} />
               <Route path="/student/dashboard" element={<StudentDashboardPage />} />
                <Route path="/registrations" element={<RegistrationsListPage />} />
                <Route path="/registration/:id/edit" element={<RegistrationPage editMode={true} />} />
                <Route path="/registration/new" element={<RegistrationPage />} />
            </Route>
          </Route>
=======
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
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
          
          {/* Catch All */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
<<<<<<< HEAD
=======
      </RegistrationProvider>
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    </AuthProvider>
  );
};

export default App;
