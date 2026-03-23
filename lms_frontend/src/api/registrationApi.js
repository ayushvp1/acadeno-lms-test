<<<<<<< HEAD
import axiosInstance from './axiosInstance';
=======
import { axiosInstance } from './axiosInstance';
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906

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
<<<<<<< HEAD
    const response = await axiosInstance.get(`/api/registration/pincode/${pin}`);
=======
    const response = await axiosInstance.get(`/api/pincode/${pin}`);
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    return response.data;
  },

  listCourses: async () => {
<<<<<<< HEAD
    const response = await axiosInstance.get('/api/registration/courses');
=======
    const response = await axiosInstance.get('/api/courses');
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    return response.data;
  },

  listBatches: async (courseId) => {
<<<<<<< HEAD
    const response = await axiosInstance.get(`/api/registration/courses/${courseId}/batches`);
    return response.data;
  },

  deleteLead: async (id) => {
    const response = await axiosInstance.delete(`/api/leads/${id}`);
=======
    const response = await axiosInstance.get(`/api/courses/${courseId}/batches`);
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    return response.data;
  },
};
