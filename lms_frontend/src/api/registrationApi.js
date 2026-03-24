import axiosInstance from './axiosInstance';

export const registrationApi = {
  createDraft: async (data, isFormData = false) => {
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const response = await axiosInstance.post('/api/registration/draft', data, config);
    return response.data;
  },

  updatePersonal: async (id, data, isFormData = false) => {
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const response = await axiosInstance.put(`/api/registration/draft/${id}/personal`, data, config);
    return response.data;
  },

  updateAddress: async (id, data) => {
    const response = await axiosInstance.put(`/api/registration/draft/${id}/address`, data);
    return response.data;
  },

  updateAcademic: async (id, data, isFormData = false) => {
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const response = await axiosInstance.put(`/api/registration/draft/${id}/academic`, data, config);
    return response.data;
  },

  updateCourse: async (id, data) => {
    const response = await axiosInstance.put(`/api/registration/draft/${id}/course`, data);
    return response.data;
  },

  submitDraft: async (id, data) => {
    const response = await axiosInstance.post(`/api/registration/draft/${id}/submit`, data);
    return response.data;
  },

  listRegistrations: async (params) => {
    const response = await axiosInstance.get('/api/registration', { params });
    return response.data;
  },

  getRegistration: async (id) => {
    const response = await axiosInstance.get(`/api/registration/${id}`);
    return response.data;
  },

  editRegistration: async (id, data) => {
    const response = await axiosInstance.put(`/api/registration/${id}`, data);
    return response.data;
  },

  // Helpers
  lookupPinCode: async (pin) => {
    const response = await axiosInstance.get(`/api/registration/pincode/${pin}`);
    return response.data;
  },

  listCourses: async () => {
    const response = await axiosInstance.get('/api/registration/courses');
    return response.data;
  },

  listBatches: async (courseId) => {
    const response = await axiosInstance.get(`/api/registration/courses/${courseId}/batches`);
    return response.data;
  },

  deleteLead: async (id) => {
    const response = await axiosInstance.delete(`/api/leads/${id}`);
    return response.data;
  },
};
