import React, { useEffect, useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import '../../styles/leads.css';

const BdaDashboardPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await axiosInstance.get('/api/leads/dashboard');
        setData(response.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  if (loading) return <div className="loading">Loading Dashboard...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const { total_leads_this_month, conversion_rate, pipeline_board, overdue_followups, monthly_target } = data;

  return (
    <div className="leads-container">
      <div className="page-header">
        <h1>BDA Dashboard</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total Leads (Month)</span>
          <span className="stat-value">{total_leads_this_month}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Conversion Rate</span>
          <span className="stat-value">{conversion_rate}%</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Monthly Target Progress</span>
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${monthly_target.percentage}%` }}></div>
          </div>
          <span className="stat-label">{monthly_target.achieved} / {monthly_target.target} Converted</span>
        </div>
      </div>

      <div className="page-header" style={{ marginTop: '20px' }}>
        <h2>Sales Pipeline</h2>
      </div>
      <div className="pipeline-board">
        {Object.entries(pipeline_board).map(([status, count]) => (
          <div key={status} className="pipeline-col">
            <div className="col-header">
              <h3>{status}</h3>
              <span className="col-count">{count}</span>
            </div>
            {/* Typically we'd show card previews here if the API returned them */}
          </div>
        ))}
      </div>

      <div className="page-header" style={{ marginTop: '20px' }}>
        <h2>Overdue Follow-ups</h2>
      </div>
      <div className="leads-table-container">
        <table className="leads-table">
          <thead>
            <tr>
              <th>Lead Name</th>
              <th>Status</th>
              <th>Follow-up Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {overdue_followups.length > 0 ? (
              overdue_followups.map((lead) => (
                <tr key={lead.id} className="overdue-row" onClick={() => window.location.href = `/leads/${lead.id}`}>
                  <td>{lead.full_name}</td>
                  <td><span className={`status-badge status-${lead.status}`}>{lead.status}</span></td>
                  <td>{new Date(lead.follow_up_date).toLocaleDateString()}</td>
                  <td><button className="btn-link">View</button></td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="4" style={{ textAlign: 'center' }}>No overdue follow-ups. Great job!</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BdaDashboardPage;
