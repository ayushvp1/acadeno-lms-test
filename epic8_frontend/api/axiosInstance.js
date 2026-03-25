import axios from 'axios';

/**
 * ACADENO LMS — EPIC 8 Mock Axios Instance
 * Points to the standalone test harness server.
 */
const axiosInstance = axios.create({
  baseURL: 'http://localhost:5555',
});

// Mocking the "HR" user token for every request
axiosInstance.interceptors.request.use(config => {
  config.headers.Authorization = `Bearer mock-hr-token`;
  return config;
});

export default axiosInstance;
