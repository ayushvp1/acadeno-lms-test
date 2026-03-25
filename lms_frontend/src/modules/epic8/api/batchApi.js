// ==========================================================================
// ACADENO LMS — Batch API (EPIC-08 Modular)
// ==========================================================================
import axiosInstance from '../../../api/axiosInstance';

export const batchApi = {
  listBatches:       (params)                => axiosInstance.get('/api/batches', { params }).then(r => r.data),
  getBatch:          (id)                    => axiosInstance.get(`/api/batches/${id}`).then(r => r.data),
  createBatch:       (data)                  => axiosInstance.post('/api/batches', data).then(r => r.data),
  updateBatch:       (id, data)              => axiosInstance.patch(`/api/batches/${id}`, data).then(r => r.data),
  assignTrainer:     (id, trainer_id)        => axiosInstance.patch(`/api/batches/${id}/trainer`, { trainer_id }).then(r => r.data),
  autoAssign:        (id)                    => axiosInstance.post(`/api/batches/${id}/auto-assign`).then(r => r.data),
  listTrainerPool:   (courseId)              => axiosInstance.get(`/api/courses/${courseId}/trainer-pool`).then(r => r.data),
  addToPool:         (courseId, trainer_id)  => axiosInstance.post(`/api/courses/${courseId}/trainer-pool`, { trainer_id }).then(r => r.data),
  removeFromPool:    (courseId, trainerId)   => axiosInstance.delete(`/api/courses/${courseId}/trainer-pool/${trainerId}`).then(r => r.data),
};
