import axiosInstance from './axiosInstance';

const taskApi = {
  createTask: async (data) => {
    const response = await axiosInstance.post('/api/tasks', data);
    return response.data;
  },

  getTrainerTasks: async (batchId) => {
    const response = await axiosInstance.get(`/api/tasks?batch_id=${batchId}`);
    return response.data;
  },

  getSubmissions: async (taskId) => {
    const response = await axiosInstance.get(`/api/tasks/${taskId}/submissions`);
    return response.data;
  },

  evaluateSubmission: async (taskId, submissionId, data) => {
    const response = await axiosInstance.patch(`/api/tasks/${taskId}/submissions/${submissionId}/evaluate`, data);
    return response.data;
  },

  getStudentTasks: async (batchId) => {
    const response = await axiosInstance.get(`/api/tasks?batch_id=${batchId}`);
    return response.data;
  },

  submitTask: async (taskId, data) => {
    const response = await axiosInstance.post(`/api/tasks/${taskId}/submit`, data);
    return response.data;
  },
  getTasks: async (batchId) => {
    const response = await axiosInstance.get(`/api/tasks?batch_id=${batchId}`);
    return response.data;
  },
  reopenSubmission: async (taskId, submissionId, reason) => {
    const response = await axiosInstance.patch(`/api/tasks/${taskId}/submissions/${submissionId}/reopen`, { reason });
    return response.data;
  },

  getTaskAnalytics: async (taskId) => {
    const response = await axiosInstance.get(`/api/tasks/${taskId}/analytics`);
    return response.data;
  },

  // Quiz Questions
  getQuizQuestions: async (taskId) => {
    const response = await axiosInstance.get(`/api/tasks/${taskId}/questions`);
    return response.data;
  },
  addQuizQuestion: async (taskId, data) => {
    const response = await axiosInstance.post(`/api/tasks/${taskId}/questions`, data);
    return response.data;
  },
  deleteQuizQuestion: async (taskId, questionId) => {
    const response = await axiosInstance.delete(`/api/tasks/${taskId}/questions/${questionId}`);
    return response.data;
  }
};

export { taskApi };
export default taskApi;
