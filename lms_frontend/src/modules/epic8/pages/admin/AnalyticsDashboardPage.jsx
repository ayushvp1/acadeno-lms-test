// ==========================================================================
// ACADENO LMS — Analytics Dashboard Page (US-HR-07 Modular)
// ==========================================================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import '../../../../styles/hr.css';

const AnalyticsDashboardPage = () => {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => { fetchAnalytics(); }, []);

  const fetchAnalytics = async () => {
    setLoading(true); setError(null);
    try { const res = await adminApi.getAnalytics(); setData(res); }
    catch (err) { setError(err.response?.data?.error || 'Failed to load analytics'); }
    finally { setLoading(false); }
  };

  if (loading) return <div className="hr-container"><div className="empty-state">Loading analytics…</div></div>;
  if (error) return <div className="hr-container"><div className="alert-error">{error}</div></div>;
  if (!data) return null;

  const maxEnrollment = Math.max(1, ...data.enrollments_by_course.map(c => c.enrollment_count));
  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(parseFloat(val) || 0);

  return (
    <div className="hr-container">
      <div className="page-header">
        <div><h1>Analytics Dashboard</h1><p style={{ color: 'var(--gray-text)', fontSize: 14 }}>Registration trends and performance metrics</p></div>
        <button className="btn-sm btn-ghost-sm" onClick={fetchAnalytics}>↻ Refresh</button>
      </div>
      <div className="analytics-stats">
        <div className="analytics-stat-card"><div className="stat-label">Active Students</div><div className="stat-value">{data.total_active_students}</div></div>
        <div className="analytics-stat-card"><div className="stat-label">Revenue This Month</div><div className="stat-value">{formatCurrency(data.monthly_revenue)}</div></div>
        <div className="analytics-stat-card"><div className="stat-label">Active Batches</div><div className="stat-value">{data.active_batch_count}</div></div>
      </div>
      <div className="bar-chart-wrap">
        <h3>Enrollments by Course</h3>
        {data.enrollments_by_course.length === 0 ? <div className="empty-state">No enrollment data</div> : (
          <div className="bar-chart">
            {data.enrollments_by_course.map((course) => (
              <div key={course.course_name} className="bar-row" onClick={() => navigate(`/batches?course_name=${encodeURIComponent(course.course_name)}`)}>
                <div className="bar-label">{course.course_name}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(course.enrollment_count / maxEnrollment) * 100}%` }} /></div>
                <div className="bar-count">{course.enrollment_count}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default AnalyticsDashboardPage;
