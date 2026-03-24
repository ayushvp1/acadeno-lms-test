// ==========================================================================
// ACADENO LMS — Batch Detail Page (US-HR-01, US-HR-02, US-HR-04)
// ==========================================================================
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { batchApi } from '../../api/batchApi';
import axiosInstance from '../../api/axiosInstance';
import '../../styles/hr.css';

const BatchDetailPage = () => {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const [batch,       setBatch]       = useState(null);
  const [pool,        setPool]        = useState([]);
  const [trainers,    setTrainers]    = useState([]);
  const [activeTab,   setActiveTab]   = useState('info');
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [success,     setSuccess]     = useState(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [newTrainerId,      setNewTrainerId]       = useState('');

  useEffect(() => {
    loadBatch();
  }, [id]);

  const loadBatch = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await batchApi.getBatch(id);
      setBatch(data.batch);
      loadPool(data.batch.course_id);
      loadTrainers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load batch');
    } finally {
      setLoading(false);
    }
  };

  const loadPool = async (courseId) => {
    try {
      const data = await batchApi.listTrainerPool(courseId);
      setPool(data.trainers);
    } catch {}
  };

  const loadTrainers = async () => {
    try {
      const res = await axiosInstance.get('/api/registration/users?role=trainer');
      setTrainers(res.data.users || []);
    } catch {}
  };

  const handleAssign = async () => {
    if (!selectedTrainerId) return;
    setError(null);
    setSuccess(null);
    try {
      const data = await batchApi.assignTrainer(id, selectedTrainerId);
      setBatch(data.batch);
      setSuccess('Trainer assigned successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign trainer');
    }
  };

  const handleAutoAssign = async () => {
    setError(null);
    setSuccess(null);
    try {
      const data = await batchApi.autoAssign(id);
      setBatch(data.batch);
      setSuccess(`Auto-assigned: ${data.trainer?.full_name}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Auto-assign failed');
    }
  };

  const handleAddToPool = async () => {
    if (!newTrainerId || !batch) return;
    setError(null);
    try {
      await batchApi.addToPool(batch.course_id, newTrainerId);
      setSuccess('Trainer added to pool');
      setNewTrainerId('');
      loadPool(batch.course_id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add trainer');
    }
  };

  const handleRemoveFromPool = async (trainerId) => {
    if (!batch) return;
    setError(null);
    try {
      await batchApi.removeFromPool(batch.course_id, trainerId);
      setSuccess('Trainer removed from pool');
      loadPool(batch.course_id);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove trainer');
    }
  };

  if (loading) return <div className="hr-container"><div className="empty-state">Loading…</div></div>;
  if (!batch)  return <div className="hr-container"><div className="alert-error">{error || 'Batch not found'}</div></div>;

  const statusBadge = (s) => <span className={`badge badge-${s}`}>{s}</span>;

  return (
    <div className="hr-container">
      <div className="page-header">
        <div>
          <h1>{batch.batch_name}</h1>
          <p style={{ color: 'var(--gray-text)', fontSize: 14 }}>{batch.course_name} &mdash; {statusBadge(batch.status)}</p>
        </div>
        <button className="btn-sm btn-ghost-sm" onClick={() => navigate('/batches')}>
          ← Back
        </button>
      </div>

      {error   && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      <div className="detail-tabs">
        {['info', 'trainer', 'pool'].map(t => (
          <button
            key={t}
            className={`detail-tab ${activeTab === t ? 'active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t === 'info' ? 'Batch Info' : t === 'trainer' ? 'Trainer Assignment' : 'Trainer Pool'}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="form-card">
          <div className="form-row">
            <InfoField label="Batch Code"    value={batch.batch_code || '—'} />
            <InfoField label="Capacity"      value={batch.capacity} />
          </div>
          <div className="form-row">
            <InfoField label="Start Date"    value={batch.start_date ? new Date(batch.start_date).toLocaleDateString() : '—'} />
            <InfoField label="End Date"      value={batch.end_date   ? new Date(batch.end_date).toLocaleDateString()   : '—'} />
          </div>
          <div className="form-row">
            <InfoField label="Schedule Type" value={batch.schedule_type || '—'} />
            <InfoField label="Class Days"    value={Array.isArray(batch.class_days) ? batch.class_days.join(', ') || '—' : '—'} />
          </div>
          <div className="form-row">
            <InfoField label="Start Time"    value={batch.class_time_start || '—'} />
            <InfoField label="End Time"      value={batch.class_time_end   || '—'} />
          </div>
          <InfoField label="Meeting URL" value={batch.meeting_url
            ? <a href={batch.meeting_url} target="_blank" rel="noreferrer">{batch.meeting_url}</a>
            : '—'} />
          <InfoField label="Enrolled Students" value={batch.enrolled_count ?? 0} />
        </div>
      )}

      {activeTab === 'trainer' && (
        <div className="form-card">
          <div>
            <label style={{ fontWeight: 700, fontSize: 13 }}>Current Trainer</label>
            <p style={{ marginTop: 4, fontSize: 15 }}>
              {batch.trainer_name
                ? <strong>{batch.trainer_name}</strong>
                : <span style={{ color: '#ef4444' }}>No trainer assigned</span>}
            </p>
          </div>

          <div>
            <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 8 }}>
              Assign from Pool
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={selectedTrainerId}
                onChange={e => setSelectedTrainerId(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Select trainer from pool…</option>
                {pool.map(t => (
                  <option key={t.trainer_id} value={t.trainer_id}>
                    {t.full_name} (active batches: {t.active_batch_count ?? 0})
                  </option>
                ))}
              </select>
              <button className="btn-sm btn-primary-sm" onClick={handleAssign}>
                Assign
              </button>
            </div>
          </div>

          <div>
            <button className="btn-sm btn-ghost-sm" onClick={handleAutoAssign}>
              ⚡ Auto-Assign (lowest load)
            </button>
            <p style={{ fontSize: 12, color: 'var(--gray-text)', marginTop: 6 }}>
              Automatically picks the trainer in the pool with the fewest active batches.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'pool' && (
        <div>
          <div className="form-card" style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 700, fontSize: 13, display: 'block', marginBottom: 8 }}>
              Add Trainer to Pool
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <select
                value={newTrainerId}
                onChange={e => setNewTrainerId(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
              >
                <option value="">Select a trainer…</option>
                {trainers
                  .filter(t => !pool.find(p => p.trainer_id === t.id))
                  .map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
              </select>
              <button className="btn-sm btn-primary-sm" onClick={handleAddToPool}>
                Add to Pool
              </button>
            </div>
          </div>

          <div className="hr-table-wrap">
            {pool.length === 0 ? (
              <div className="empty-state">No trainers in pool for this course yet.</div>
            ) : (
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Trainer</th>
                    <th>Active Batches</th>
                    <th>Added At</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pool.map(t => (
                    <tr key={t.trainer_id}>
                      <td><strong>{t.full_name}</strong><br /><span style={{ fontSize: 12, color: 'var(--gray-text)' }}>{t.email}</span></td>
                      <td>{t.active_batch_count ?? 0}</td>
                      <td>{t.added_at ? new Date(t.added_at).toLocaleDateString() : '—'}</td>
                      <td>
                        <button
                          className="btn-sm btn-danger-sm"
                          onClick={() => handleRemoveFromPool(t.trainer_id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const InfoField = ({ label, value }) => (
  <div className="form-field">
    <label>{label}</label>
    <div style={{ padding: '8px 0', fontSize: 15, color: 'var(--text-dark)' }}>{value}</div>
  </div>
);

export default BatchDetailPage;
