// ==========================================================================
// ACADENO LMS — Batch Detail Page (US-HR-01, US-HR-02, US-HR-04 Modular)
// ==========================================================================
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { batchApi } from '../../api/batchApi';
import axiosInstance from '../../../../api/axiosInstance';
import '../../../../styles/hr.css';

const BatchDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [pool, setPool] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [activeTab, setActiveTab] = useState('info');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedTrainerId, setSelectedTrainerId] = useState('');

  useEffect(() => { loadBatch(); }, [id]);

  const loadBatch = async () => {
    setLoading(true); setError(null);
    try {
      const data = await batchApi.getBatch(id); setBatch(data.batch);
      const poolData = await batchApi.listTrainerPool(data.batch.course_id); setPool(poolData.trainers);
      const res = await axiosInstance.get('/api/registration/users?role=trainer'); setTrainers(res.data.users || []);
    } catch (err) { setError('Failed to load batch'); }
    finally { setLoading(false); }
  };

  const handleAssign = async () => {
    if (!selectedTrainerId) return; setError(null); setSuccess(null);
    try { const data = await batchApi.assignTrainer(id, selectedTrainerId); setBatch(data.batch); setSuccess('Assigned successfully'); }
    catch (err) { setError('Assignment failed'); }
  };

  if (loading) return <div className="hr-container">Loading…</div>;
  if (!batch) return <div className="hr-container">{error}</div>;

  return (
    <div className="hr-container">
      <div className="page-header"><div><h1>{batch.batch_name}</h1><p>{batch.course_name}</p></div><button onClick={() => navigate('/batches')}>← Back</button></div>
      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}
      <div className="detail-tabs">
        <button className={activeTab === 'info' ? 'active' : ''} onClick={() => setActiveTab('info')}>Info</button>
        <button className={activeTab === 'trainer' ? 'active' : ''} onClick={() => setActiveTab('trainer')}>Trainer</button>
      </div>
      {activeTab === 'info' && <div className="form-card"><p><strong>Code:</strong> {batch.batch_code}</p><p><strong>Status:</strong> {batch.status}</p><p><strong>Capacity:</strong> {batch.capacity}</p></div>}
      {activeTab === 'trainer' && (
        <div className="form-card">
          <p>Current: {batch.trainer_name || 'Unassigned'}</p>
          <select value={selectedTrainerId} onChange={e => setSelectedTrainerId(e.target.value)}>
            <option value="">Choose…</option>{pool.map(t => (<option key={t.trainer_id} value={t.trainer_id}>{t.full_name}</option>))}
          </select>
          <button onClick={handleAssign}>Assign</button>
        </div>
      )}
    </div>
  );
};
export default BatchDetailPage;
