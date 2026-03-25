import axiosInstance from './axiosInstance';

export const courseApi = {
  getCourses: async () => {
    const response = await axiosInstance.get('/api/courses');
    return response.data;
  },

  listCourses: async () => {
    const response = await axiosInstance.get('/api/courses');
    return response.data;
  },

  getCourse: async (id) => {
    const response = await axiosInstance.get(`/api/courses/${id}`);
    return response.data;
  },

  createCourse: async (data) => {
    const response = await axiosInstance.post('/api/courses', data);
    return response.data;
  },

  updateCourse: async (id, data) => {
    const response = await axiosInstance.patch(`/api/courses/${id}`, data);
    return response.data;
  },

  deactivateCourse: async (id) => {
    const response = await axiosInstance.delete(`/api/courses/${id}/deactivate`);
    return response.data;
  },

  // Modules
  getModules: async (courseId) => {
    const response = await axiosInstance.get(`/api/courses/${courseId}/modules`);
    return response.data;
  },

  createModule: async (courseId, data) => {
    const response = await axiosInstance.post(`/api/courses/${courseId}/modules`, data);
    return response.data;
  },

  updateModule: async (courseId, modId, data) => {
    const response = await axiosInstance.patch(`/api/courses/${courseId}/modules/${modId}`, data);
    return response.data;
  },

  deleteModule: async (courseId, modId) => {
    const response = await axiosInstance.delete(`/api/courses/${courseId}/modules/${modId}`);
    return response.data;
  },

  // Sub-modules
  createSubModule: async (courseId, moduleId, data) => {
    const response = await axiosInstance.post(`/api/courses/${courseId}/modules/${moduleId}/sub-modules`, data);
    return response.data;
  },

  // Content
  getSubModuleContent: async (courseId, moduleId, subModuleId) => {
    const response = await axiosInstance.get(`/api/courses/${courseId}/modules/${moduleId}/sub-modules/${subModuleId}/content`);
    return response.data;
  },

  uploadContent: async (courseId, moduleId, subModuleId, formData) => {
    const response = await axiosInstance.post(`/api/courses/${courseId}/modules/${moduleId}/sub-modules/${subModuleId}/content`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },

  deleteContent: async (courseId, subModuleId, contentId) => {
    const response = await axiosInstance.delete(`/api/courses/${courseId}/modules/stub/sub-modules/${subModuleId}/content/${contentId}`);
    return response.data;
  },

  // Batches & Analytics
  listCourseBatches: async (courseId) => {
    const response = await axiosInstance.get(`/api/courses/${courseId}/batches`);
    return response.data;
  },

  getBatchDashboard: async (batchId) => {
    const response = await axiosInstance.get(`/api/courses/batches/${batchId}/dashboard`);
    return response.data;
  },

  // Live Sessions
  getLiveSessions: async (batchId) => {
    const response = await axiosInstance.get(`/api/courses/batches/${batchId}/live-sessions`);
    return response.data;
  },

  createLiveSession: async (batchId, data) => {
    const response = await axiosInstance.post(`/api/courses/batches/${batchId}/live-sessions`, data);
    return response.data;
  }
};

export default courseApi;
