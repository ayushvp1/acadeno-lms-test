import axiosInstance from './axiosInstance';

const announcementApi = {
  createAnnouncement: async (data) => {
    const response = await axiosInstance.post('/api/announcements', data);
    return response.data;
  },

  getBatchAnnouncements: async (batchId) => {
    const response = await axiosInstance.get(`/api/announcements/batch/${batchId}`);
    return response.data;
  },

  deleteAnnouncement: async (id) => {
    const response = await axiosInstance.delete(`/api/announcements/${id}`);
    return response.data;
  }
};

export { announcementApi };
export default announcementApi;
