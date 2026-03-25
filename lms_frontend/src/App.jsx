import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RegistrationProvider } from './context/RegistrationContext';
import ProtectedRoute from './components/ProtectedRoute';

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
import BatchListPage from './pages/hr/BatchListPage';
import CreateBatchPage from './pages/hr/CreateBatchPage';
import BatchDetailPage from './pages/hr/BatchDetailPage';
import TrainerPoolPage from './pages/hr/TrainerPoolPage';
import EnrollmentsPage from './pages/hr/EnrollmentsPage';
import AuditReportsPage from './pages/hr/AuditReportsPage';
import SystemSettingsPage from './pages/admin/SystemSettingsPage';
import AnalyticsDashboardPage from './pages/admin/AnalyticsDashboardPage';


// Trainer Pages
import CourseBuilderPage from './pages/trainer/CourseBuilderPage';
import ContentUploaderPage from './pages/trainer/ContentUploaderPage';
import TaskManagerPage from './pages/trainer/TaskManagerPage';
import BatchDashboardPage from './pages/trainer/BatchDashboardPage';
import LiveSessionPage from './pages/trainer/LiveSessionPage';

import StaffDashboardPage from './pages/StaffDashboardPage';
import BdaDashboardPage from './pages/bda/BdaDashboardPage';

const DashboardSwitcher = () => {
  const { user } = useAuth();
  if (user?.role === 'student') return <Navigate to="/student/dashboard" replace />;
  if (user?.role === 'bda') return <BdaDashboardPage />;
  if (user?.role === 'hr') return <AnalyticsDashboardPage />;
  if (user?.role === 'super_admin') return <AnalyticsDashboardPage />;
  if (user?.role === 'trainer') return <StaffDashboardPage />;

  return (
    <div style={{ padding: '40px' }} className="premium-card">
      <h2 style={{ marginBottom: '16px' }}>Welcome to Acadeno LMS, {user?.email}</h2>
      <p style={{ color: '#64748b' }}>Select a module from the sidebar to manage academy operations.</p>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
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
                <Route path="/leads/dashboard" element={<BdaDashboardPage />} />
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
                
                {/* EPIC-08 HR & Admin Routes */}
                <Route path="/hr/batches" element={<BatchListPage />} />
                <Route path="/hr/batches/new" element={<CreateBatchPage />} />
                <Route path="/hr/batches/:id" element={<BatchDetailPage />} />
                <Route path="/hr/trainer-pool" element={<TrainerPoolPage />} />
                <Route path="/hr/enrollments" element={<EnrollmentsPage />} />
                <Route path="/hr/reports" element={<AuditReportsPage />} />
                
                <Route path="/admin/settings" element={<SystemSettingsPage />} />
                <Route path="/admin/analytics" element={<AnalyticsDashboardPage />} />

                
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
    </AuthProvider>
  );
};

export default App;
