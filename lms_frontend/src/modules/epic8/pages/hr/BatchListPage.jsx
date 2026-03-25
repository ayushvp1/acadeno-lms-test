// ==========================================================================
// ACADENO LMS — Batch List Page (US-HR-01 Modular)
// ==========================================================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { batchApi } from '../../api/batchApi';
import '../../../../styles/hr.css';

const BatchListPage = () => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ course_id: '', status: '' });

  useEffect(() => { fetchBatches(); }, []);

  const fetchBatches = async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (filters.course_id) params.course_id = filters.course_id;
      if (filters.status) params.status = filters.status;
      const data = await batchApi.listBatches(params);
      setBatches(data.batches);
    } catch (err) { setError(err.response?.data?.error || 'Failed to load batches'); }
    finally { setLoading(false); }
  };

  const handleFilterChange = (e) => { setFilters(prev => ({ ...prev, [e.target.name]: e.target.value })); };
  const statusBadge = (status) => <span className={`badge badge-${status}`}>{status}</span>;

  return (
    <div className="hr-container">
      <div className="page-header">
        <div><h1>Batches</h1><p style={{ color: 'var(--gray-text)', fontSize: 14 }}>Manage course batches and trainer assignments</p></div>
        <button className="btn-sm btn-primary-sm" onClick={() => navigate('/batches/new')}>+ Create Batch</button>
      </div>
      <div className="filter-bar">
        <div className="filter-group"><label>Status</label>
          <select name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="">All Statuses</option><option value="upcoming">Upcoming</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button className="btn-sm btn-primary-sm" onClick={fetchBatches} style={{ alignSelf: 'flex-end' }}>Apply Filters</button>
      </div>
      {error && <div className="alert-error">{error}</div>}
      <div className="hr-table-wrap">
        {loading ? <div className="empty-state">Loading batches…</div> : batches.length === 0 ? <div className="empty-state">No batches found.</div> : (
          <table className="hr-table">
            <thead><tr><th>Batch Name</th><th>Course</th><th>Batch Code</th><th>Start Date</th><th>Trainer</th><th>Enrolled</th><th>Capacity</th><th>Status</th></tr></thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} onClick={() => navigate(`/batches/${b.id}`)}>
                  <td><strong>{b.batch_name}</strong></td><td>{b.course_name}</td><td>{b.batch_code || '—'}</td><td>{b.start_date ? new Date(b.start_date).toLocaleDateString() : '—'}</td>
                  <td>{b.trainer_name || <span style={{ color: '#ef4444' }}>Unassigned</span>}</td><td>{b.enrolled_count}</td><td>{b.capacity}</td><td>{statusBadge(b.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
export default BatchListPage;
