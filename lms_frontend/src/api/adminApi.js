// ==========================================================================
// ACADENO LMS — Admin API (EPIC-08)
// ==========================================================================
import axiosInstance from './axiosInstance';

export const adminApi = {
  listSettings:   ()           => axiosInstance.get('/api/admin/settings').then(r => r.data),
  updateSetting:  (key, data)  => axiosInstance.patch(`/api/admin/settings/${key}`, data).then(r => r.data),
  getAnalytics:   ()           => axiosInstance.get('/api/admin/analytics').then(r => r.data),
};
