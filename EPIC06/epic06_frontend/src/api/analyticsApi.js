import axiosInstance from './axiosInstance';

const analyticsApi = {
    getGlobalStats: async () => {
        const response = await axiosInstance.get('/api/analytics/global');
        return response.data;
    },

    getBatchAnalytics: async (batchId) => {
        const response = await axiosInstance.get(`/api/analytics/batches/${batchId}`);
        return response.data;
    },

    getStudentStats: async (studentId) => {
        const response = await axiosInstance.get(`/api/analytics/students/${studentId}`);
        return response.data;
    },

    exportBatchReport: async (batchId, format = 'csv') => {
        const response = await axiosInstance.get(`/api/analytics/batches/${batchId}/export?format=${format}`, {
            responseType: 'blob'
        });
        return response;
    },

    getStudentTimeline: async (studentId) => {
        const response = await axiosInstance.get(`/api/analytics/students/${studentId}/timeline`);
        return response.data;
    }
};

export { analyticsApi };
export default analyticsApi;
