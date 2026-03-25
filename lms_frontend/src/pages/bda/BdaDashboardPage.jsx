import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { Target, PieChart, TrendingUp, Calendar, AlertCircle, ChevronRight, Users, Activity } from 'lucide-react';
import '../../styles/epic8.css';

const BdaDashboardPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

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

  if (loading) return (
    <div className="epic8-loader-container">
        <div className="spinner"></div>
        <span>Loading sales pipeline...</span>
    </div>
  );
  
  if (error) return (
    <div className="epic8-page-container">
        <div className="premium-card" style={{ padding: '40px', textAlign: 'center', borderColor: 'var(--error)' }}>
            <AlertCircle size={48} color="var(--error)" style={{ marginBottom: '1rem' }} />
            <h3>Data Load Error</h3>
            <p>{error}</p>
        </div>
    </div>
  );

  const { total_leads_this_month, conversion_rate, pipeline_board, overdue_followups, monthly_target } = data;

  return (
    <div className="epic8-page-container">
      <div className="epic8-header">
        <div>
          <h1>Lead Analytics Dashboard</h1>
          <p>Performance tracking and pipeline management for recruitment operations</p>
        </div>
        <div className="date-display">
            <Calendar size={18} />
            <span>Monthly Cycle: {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary-blue)' }}>
            <Target size={24} />
          </div>
          <div className="stat-info">
            <h3>Total Leads (MTD)</h3>
            <div className="stat-value">{total_leads_this_month}</div>
            <div className="stat-trend trend-stable">Monthly Acquisitions</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
            <PieChart size={24} />
          </div>
          <div className="stat-info">
            <h3>Lead Conversion</h3>
            <div className="stat-value">{conversion_rate}%</div>
            <div className="stat-trend trend-up">
              <TrendingUp size={14} /> Efficient transition
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrapper" style={{ background: 'rgba(234, 88, 12, 0.1)', color: '#ea580c' }}>
            <Activity size={24} />
          </div>
          <div className="stat-info">
            <h3>Target Progress</h3>
            <div className="stat-value">{monthly_target.achieved} / {monthly_target.target}</div>
            <div className="progress-bar-small">
                <div className="progress-fill" style={{ width: `${monthly_target.percentage}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="analytics-layout" style={{ gridTemplateColumns: '1.4fr 0.6fr', marginBottom: '2.5rem' }}>
        <div className="premium-card">
          <div className="search-filter-bar">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Sales Pipeline Board</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', padding: '24px' }}>
             {Object.entries(pipeline_board).map(([status, count]) => (
                <div key={status} style={{ background: 'var(--gray-light)', padding: '20px', borderRadius: '12px', border: '1px solid var(--gray-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--gray-text)', textTransform: 'uppercase', marginBottom: '8px' }}>{status}</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-dark)' }}>{count}</div>
                </div>
             ))}
          </div>
        </div>

        <div className="premium-card">
           <div className="search-filter-bar" style={{ background: 'rgba(239, 68, 68, 0.05)' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--error)' }}>Critical Follow-ups</h2>
           </div>
           <div style={{ padding: '20px' }}>
                {overdue_followups.slice(0, 5).map(lead => (
                    <div key={lead.id} style={{ paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid var(--gray-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{lead.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--error)' }}>Due: {new Date(lead.follow_up_date).toLocaleDateString()}</div>
                        </div>
                        <button className="icon-btn-text" onClick={() => navigate(`/leads/${lead.id}`)}>
                            <ChevronRight size={16} />
                        </button>
                    </div>
                ))}
                {overdue_followups.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--gray-text)' }}>
                        <Users size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
                        <p style={{ fontSize: '0.85rem' }}>Pipeline is clean!</p>
                    </div>
                )}
           </div>
        </div>
      </div>

      <div className="premium-card">
        <div className="search-filter-bar">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Detailed Follow-up Registry</h2>
        </div>
        <div className="table-wrapper">
            <table className="epic8-table">
                <thead>
                    <tr>
                        <th>Lead Prospect</th>
                        <th>Contact Email</th>
                        <th>Status</th>
                        <th>Scheduled Follow-up</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {overdue_followups.map((lead) => (
                        <tr key={lead.id}>
                            <td className="table-primary-text">{lead.full_name}</td>
                            <td className="table-secondary-text">{lead.email || 'N/A'}</td>
                            <td>
                                <span className={`status-badge status-${lead.status}`}>
                                    {lead.status.toUpperCase()}
                                </span>
                            </td>
                            <td>{new Date(lead.follow_up_date).toLocaleDateString()}</td>
                            <td style={{ textAlign: 'right' }}>
                                <button className="btn-premium-primary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => navigate(`/leads/${lead.id}`)}>
                                    Detail View
                                </button>
                            </td>
                        </tr>
                    ))}
                    {overdue_followups.length === 0 && (
                        <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray-text)' }}>
                                All follow-ups are up to date.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default BdaDashboardPage;
