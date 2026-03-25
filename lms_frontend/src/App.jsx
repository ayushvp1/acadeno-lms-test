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
  if (user?.role === 'hr') return <StudentStatsPage />;
  if (user?.role === 'super_admin' || user?.role === 'trainer') return <StaffDashboardPage />;
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
    </AuthProvider>
  );
};

export default App;
