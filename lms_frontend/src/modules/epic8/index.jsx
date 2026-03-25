// ==========================================================================
// ACADENO LMS — EPIC 8 Modular Frontend Routes
// ==========================================================================
import React from 'react';
import { Route } from 'react-router-dom';

import BatchListPage          from './pages/hr/BatchListPage';
import CreateBatchPage        from './pages/hr/CreateBatchPage';
import BatchDetailPage        from './pages/hr/BatchDetailPage';
import EnrollmentsPage        from './pages/hr/EnrollmentsPage';
import ReportsPage            from './pages/hr/ReportsPage';
import SystemSettingsPage     from './pages/admin/SystemSettingsPage';
import AnalyticsDashboardPage from './pages/admin/AnalyticsDashboardPage';

/**
 * Returns a list of all routes defined for EPIC 8.
 * Can be spread into the main Routes component.
 */
export const getEpic8Routes = () => [
  <Route key="batches"             path="/batches"               element={<BatchListPage />} />,
  <Route key="batches-new"         path="/batches/new"           element={<CreateBatchPage />} />,
  <Route key="batches-id"          path="/batches/:id"           element={<BatchDetailPage />} />,
  <Route key="hr-enrollments"      path="/hr/enrollments"        element={<EnrollmentsPage />} />,
  <Route key="hr-reports"          path="/hr/reports"            element={<ReportsPage />} />,
  <Route key="admin-settings"      path="/admin/settings"        element={<SystemSettingsPage />} />,
  <Route key="admin-analytics"     path="/admin/analytics"       element={<AnalyticsDashboardPage />} />,
];

export {
  BatchListPage,
  CreateBatchPage,
  BatchDetailPage,
  EnrollmentsPage,
  ReportsPage,
  SystemSettingsPage,
  AnalyticsDashboardPage,
};
