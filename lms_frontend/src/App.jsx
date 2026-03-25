import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RegistrationProvider } from './context/RegistrationContext';
import ProtectedRoute from './components/ProtectedRoute';

<<<<<<< HEAD
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
=======
// Basic Pages
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import LeadsListPage from "./pages/bda/LeadsListPage";
import NewLeadPage from "./pages/bda/NewLeadPage";
import LeadDetailPage from "./pages/bda/LeadDetailPage";
import ImportLeadsPage from "./pages/bda/ImportLeadsPage";
import StudentDashboardPage from './pages/StudentDashboardPage';
import RegistrationsListPage from './pages/RegistrationsListPage';
import RegistrationPage from './pages/RegistrationPage';
import CoursesPage from './pages/CoursesPage';

// HR & Admin Pages
import CourseManagementPage from './pages/hr/CourseManagementPage';
import StudentStatsPage from './pages/hr/StudentStatsPage';

// Trainer Pages
import CourseBuilderPage from './pages/trainer/CourseBuilderPage';
import ContentUploaderPage from './pages/trainer/ContentUploaderPage';
import TaskManagerPage from './pages/trainer/TaskManagerPage';
import BatchDashboardPage from './pages/trainer/BatchDashboardPage';
import LiveSessionPage from './pages/trainer/LiveSessionPage';

>>>>>>> origin/main
import StaffDashboardPage from './pages/StaffDashboardPage';
import BdaDashboardPage from './pages/bda/BdaDashboardPage';

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
<<<<<<< HEAD
  if (user?.role === 'student') return <StudentDashboardPage />;
  if (user?.role === 'super_admin' || user?.role === 'trainer') return <StaffDashboardPage />;
  return <BdaDashboardPage />;
=======
  if (user?.role === 'student') return <Navigate to="/student/dashboard" replace />;
  if (user?.role === 'bda') return <BdaDashboardPage />;
  if (user?.role === 'hr') return <StudentStatsPage />;
  if (user?.role === 'super_admin' || user?.role === 'trainer') return <StaffDashboardPage />;
  return (
    <div style={{ padding: '40px' }} className="premium-card">
      <h2 style={{ marginBottom: '16px' }}>Welcome to Acadeno LMS, {user?.email}</h2>
      <p style={{ color: '#64748b' }}>Select a module from the sidebar to manage academy operations.</p>
    </div>
  );
>>>>>>> origin/main
};

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
=======
      <RegistrationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
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
                <Route path="/courses" element={<CoursesPage />} />
                
                {/* HR & SuperAdmin Shared */}
                <Route path="/hr/student-stats" element={<StudentStatsPage />} />
                <Route path="/superadmin/student-stats" element={<StudentStatsPage />} />
                <Route path="/hr/courses" element={<CourseManagementPage />} />
                
                {/* Trainer EPIC-05 */}
                <Route path="/trainer/course/:courseId" element={<CourseBuilderPage />} />
                <Route path="/trainer/course/:courseId/module/:moduleId/content/:subModuleId" element={<ContentUploaderPage />} />
                <Route path="/trainer/tasks" element={<TaskManagerPage />} />
                <Route path="/trainer/batch/:batchId/dashboard" element={<BatchDashboardPage />} />
                <Route path="/trainer/batch/:batchId/live-sessions" element={<LiveSessionPage />} />

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
            
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </RegistrationProvider>
>>>>>>> origin/main
    </AuthProvider>
  );
};

export default App;
