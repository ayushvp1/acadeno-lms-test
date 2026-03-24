// ==========================================================================
// ACADENO LMS — Registration Reports Page (US-HR-05)
// ==========================================================================
import React, { useState } from 'react';
import { hrApi } from '../../api/hrApi';
import '../../styles/hr.css';

const ReportsPage = () => {
  const [report,   setReport]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState(null);
  const [filters, setFilters] = useState({
    date_from:           '',
    date_to:             '',
    course_id:           '',
    batch_id:            '',
    registration_status: '',
    payment_status:      '',
  });

  const handleFilterChange = (e) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const data = await hrApi.getReport(params);
      setReport(data.report);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await hrApi.exportCSV(params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `registrations_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Export failed');
    }
  };

  const statusBadge = (s, type) => {
    const cls = type === 'payment'
      ? (s === 'paid' ? 'paid' : s === 'pending' ? 'pending' : 'failed')
      : 'active';
    return <span className={`badge badge-${cls}`}>{s || '—'}</span>;
  };

  return (
    <div className="hr-container">
      <div className="page-header">
        <div>
          <h1>Registration Reports</h1>
          <p style={{ color: 'var(--gray-text)', fontSize: 14 }}>
            Filter and export registration data
          </p>
        </div>
        {report.length > 0 && (
          <button className="btn-sm btn-primary-sm" onClick={handleExport}>
            ⬇ Export CSV
          </button>
        )}
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label>Date From</label>
          <input type="date" name="date_from" value={filters.date_from} onChange={handleFilterChange} />
        </div>
        <div className="filter-group">
          <label>Date To</label>
          <input type="date" name="date_to" value={filters.date_to} onChange={handleFilterChange} />
        </div>
        <div className="filter-group">
          <label>Registration Status</label>
          <select name="registration_status" value={filters.registration_status} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="dropped">Dropped</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Payment Status</label>
          <select name="payment_status" value={filters.payment_status} onChange={handleFilterChange}>
            <option value="">All</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <button className="btn-sm btn-primary-sm" onClick={fetchReport} style={{ alignSelf: 'flex-end' }}>
          Run Report
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="hr-table-wrap">
        {loading ? (
          <div className="empty-state">Generating report…</div>
        ) : !searched ? (
          <div className="empty-state">Apply filters and click "Run Report" to view data.</div>
        ) : report.length === 0 ? (
          <div className="empty-state">No registrations found for the selected filters.</div>
        ) : (
          <>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 13, color: 'var(--gray-text)' }}>
              {report.length} result{report.length !== 1 ? 's' : ''}
            </div>
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Reg No.</th>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Registered At</th>
                </tr>
              </thead>
              <tbody>
                {report.map((row, i) => (
                  <tr key={i}>
                    <td><code>{row.registration_number}</code></td>
                    <td>
                      <strong>{row.student_name}</strong>
                      <br />
                      <span style={{ fontSize: 12, color: 'var(--gray-text)' }}>{row.email}</span>
                    </td>
                    <td>{row.course_name}</td>
                    <td>{row.batch_name || '—'}</td>
                    <td>{statusBadge(row.registration_status, 'reg')}</td>
                    <td>{statusBadge(row.payment_status, 'payment')}</td>
                    <td>{row.registered_at ? new Date(row.registered_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
