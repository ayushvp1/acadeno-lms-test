// ==========================================================================
// ACADENO LMS — HR API (EPIC-08)
// ==========================================================================
import axiosInstance from './axiosInstance';

export const hrApi = {
  listEnrollments:     (params) => axiosInstance.get('/api/hr/enrollments', { params }).then(r => r.data),
  getEnrollmentDetail: (studentId) => axiosInstance.get(`/api/hr/enrollments/${studentId}`).then(r => r.data),
  getReport:           (params) => axiosInstance.get('/api/hr/reports/registrations', { params }).then(r => r.data),
  exportCSV:           (params) => axiosInstance.get('/api/hr/reports/registrations/export', { params, responseType: 'blob' }),
};
