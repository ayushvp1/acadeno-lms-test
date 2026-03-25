// ==========================================================================
// ACADENO LMS — Enrollments Page (US-HR-03 Modular)
// ==========================================================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hrApi } from '../../api/hrApi';
import '../../../../styles/hr.css';

const EnrollmentsPage = () => {
  const navigate = useNavigate();
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ status: '', payment_status: '', course_id: '', batch_id: '' });

  useEffect(() => { fetchEnrollments(); }, []);

  const fetchEnrollments = async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const data = await hrApi.listEnrollments(params);
      setEnrollments(data.enrollments);
    } catch (err) { setError(err.response?.data?.error || 'Failed to load enrollments'); }
    finally { setLoading(false); }
  };

  const handleFilterChange = (e) => { setFilters(prev => ({ ...prev, [e.target.name]: e.target.value })); };
  const statusBadge = (s, type) => {
    const cls = type === 'payment' ? (s === 'paid' ? 'paid' : s === 'pending' ? 'pending' : 'failed') : (s === 'active' ? 'active' : s === 'completed' ? 'completed' : 'pending');
    return <span className={`badge badge-${cls}`}>{s || '—'}</span>;
  };

  return (
    <div className="hr-container">
      <div className="page-header">
        <div><h1>Enrollments</h1><p style={{ color: 'var(--gray-text)', fontSize: 14 }}>View and filter all student enrollments</p></div>
      </div>
      <div className="filter-bar">
        <div className="filter-group"><label>Enrollment Status</label>
          <select name="status" value={filters.status} onChange={handleFilterChange}>
            <option value="">All</option><option value="active">Active</option><option value="completed">Completed</option><option value="dropped">Dropped</option>
          </select>
        </div>
        <div className="filter-group"><label>Payment Status</label>
          <select name="payment_status" value={filters.payment_status} onChange={handleFilterChange}>
            <option value="">All</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option>
          </select>
        </div>
        <button className="btn-sm btn-primary-sm" onClick={fetchEnrollments} style={{ alignSelf: 'flex-end' }}>Apply Filters</button>
      </div>
      {error && <div className="alert-error">{error}</div>}
      <div className="hr-table-wrap">
        {loading ? <div className="empty-state">Loading enrollments…</div> : enrollments.length === 0 ? <div className="empty-state">No enrollments match the selected filters.</div> : (
          <table className="hr-table">
            <thead><tr><th>Reg No.</th><th>Student Name</th><th>Course</th><th>Batch</th><th>Enrollment</th><th>Payment</th><th>Completion %</th></tr></thead>
            <tbody>
              {enrollments.map(e => (
                <tr key={e.enrollment_id} onClick={() => navigate(`/hr/enrollments/${e.student_id || e.enrollment_id}`)}>
                  <td><code>{e.registration_number}</code></td>
                  <td><strong>{e.student_name}</strong><br /><span style={{ fontSize: 12, color: 'var(--gray-text)' }}>{e.email}</span></td>
                  <td>{e.course_name}</td><td>{e.batch_name || '—'}</td><td>{statusBadge(e.enrollment_status, 'enrollment')}</td><td>{statusBadge(e.payment_status, 'payment')}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 8 }}>
                        <div style={{ width: `${e.completion_pct || 0}%`, background: 'var(--navy-bg)', height: '100%', borderRadius: 4, minWidth: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, minWidth: 36 }}>{e.completion_pct ?? 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
export default EnrollmentsPage;
