import axiosInstance from './axiosInstance';

/**
 * EPIC-08: API Services for Batches, HR and Admin Management
 */
export const hrAdminApi = {
  // --- Batches (User Story: US-HR-01 & US-HR-02) ---
  listBatches: (params) => axiosInstance.get('/api/batches', { params }).then(r => r.data),
  getBatch: (id) => axiosInstance.get(`/api/batches/${id}`).then(r => r.data),
  createBatch: (data) => axiosInstance.post('/api/batches', data).then(r => r.data),
  updateBatch: (id, data) => axiosInstance.patch(`/api/batches/${id}`, data).then(r => r.data),
  assignTrainer: (id, trainerId) => axiosInstance.patch(`/api/batches/${id}/trainer`, { trainer_id: trainerId }).then(r => r.data),
  autoAssignTrainer: (id) => axiosInstance.post(`/api/batches/${id}/auto-assign`).then(r => r.data),
  listTrainerPool: (courseId) => axiosInstance.get(`/api/batches/course/${courseId}/trainer-pool`).then(r => r.data),
  addToPool: (data) => axiosInstance.post(`/api/batches/trainer-pool`, data).then(r => r.data),
  removeFromPool: (courseId, trainerId) => axiosInstance.delete(`/api/batches/trainer-pool/${courseId}/${trainerId}`).then(r => r.data),

  // --- HR Enrollments & Reports (User Story: US-HR-03 & US-HR-05) ---
  listEnrollments: (params) => axiosInstance.get('/api/hr/enrollments', { params }).then(r => r.data),
  getEnrollmentDetail: (studentId) => axiosInstance.get(`/api/hr/enrollments/${studentId}`).then(r => r.data),
  getReport: (params) => axiosInstance.get('/api/hr/reports/registrations', { params }).then(r => r.data),
  listTrainers: () => axiosInstance.get('/api/hr/trainers').then(r => r.data),
  exportCSV: async (params) => {
    const response = await axiosInstance.get('/api/hr/reports/registrations/export', { params, responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'registrations.csv');
    document.body.appendChild(link);
    link.click();
    link.remove();
  },

  // --- Admin Settings & Analytics (User Story: US-HR-06 & US-HR-07) ---
  listSettings: () => axiosInstance.get('/api/admin/settings').then(r => r.data),
  updateSetting: (key, data) => axiosInstance.patch(`/api/admin/settings/${key}`, data).then(r => r.data),
  getAnalytics: () => axiosInstance.get('/api/admin/analytics').then(r => r.data),
};
