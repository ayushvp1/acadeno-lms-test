import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { registrationApi } from '../../api/registrationApi';
import { Target, PieChart, TrendingUp, Search, Filter, Plus, Mail, Trash2, ChevronRight, Activity } from 'lucide-react';
import '../../styles/epic8.css';

const LeadsListPage = () => {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;
  const [deletingLeadId, setDeletingLeadId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const navigate = useNavigate();

  const fetchStats = async () => {
    try {
      const response = await axiosInstance.get('/api/leads/dashboard');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch lead stats');
    }
  };

  const fetchLeads = useCallback(async (currentSearch, currentStatus, currentPage) => {
    setLoading(true);
    try {
      const response = await axiosInstance.get('/api/leads', {
        params: {
          search: currentSearch,
          status: currentStatus,
          page: currentPage,
          limit: limit
        }
      });
      setLeads(response.data.leads);
      setTotalCount(response.data.total_count);
      setTotalPages(response.data.total_pages);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1);
      fetchLeads(search, status, 1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search, status, fetchLeads]);

  useEffect(() => {
    if (page > 1) {
       fetchLeads(search, status, page);
    }
  }, [page, fetchLeads]);

  const handleSendInvite = async (leadId) => {
    try {
      const response = await axiosInstance.post(`/api/leads/${leadId}/convert`);
      alert(response.data.message || 'Registration link sent successfully!');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send registration link.');
    }
  };

  const confirmDeleteLead = async () => {
    if (!deletingLeadId) return;
    try {
      await registrationApi.deleteLead(deletingLeadId);
      fetchLeads(search, status, page);
      fetchStats();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete lead');
    } finally {
      setDeletingLeadId(null);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="epic8-page-container">
      <div className="epic8-header">
        <div>
          <h1>Lead Management</h1>
          <p>Consolidated pipeline view and lead conversion portal</p>
        </div>
        <button className="btn-premium-primary" onClick={() => navigate('/leads/new')}>
          <Plus size={18} /> Add New Prospect
        </button>
      </div>

      {/* Mini Stats Row */}
      <div className="stat-grid" style={{ marginBottom: '2rem', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card" style={{ padding: '16px' }}>
            <div className="stat-icon-wrapper" style={{ width: '40px', height: '40px', background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary-blue)' }}>
                <Target size={20} />
            </div>
            <div className="stat-info">
                <h3 style={{ fontSize: '0.7rem' }}>Total Leads</h3>
                <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats?.total_leads_this_month || 0}</div>
            </div>
        </div>
        <div className="stat-card" style={{ padding: '16px' }}>
            <div className="stat-icon-wrapper" style={{ width: '40px', height: '40px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                <PieChart size={20} />
            </div>
            <div className="stat-info">
                <h3 style={{ fontSize: '0.7rem' }}>Conv. Rate</h3>
                <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats?.conversion_rate || 0}%</div>
            </div>
        </div>
        <div className="stat-card" style={{ padding: '16px' }}>
            <div className="stat-icon-wrapper" style={{ width: '40px', height: '40px', background: 'rgba(234, 88, 12, 0.1)', color: '#ea580c' }}>
                <Activity size={20} />
            </div>
            <div className="stat-info">
                <h3 style={{ fontSize: '0.7rem' }}>New Leads</h3>
                <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats?.pipeline_board?.new || 0}</div>
            </div>
        </div>
        <div className="stat-card" style={{ padding: '16px' }}>
            <div className="stat-icon-wrapper" style={{ width: '40px', height: '40px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)' }}>
                <TrendingUp size={20} />
            </div>
            <div className="stat-info">
                <h3 style={{ fontSize: '0.7rem' }}>Overdue</h3>
                <div className="stat-value" style={{ fontSize: '1.25rem' }}>{stats?.overdue_followups?.length || 0}</div>
            </div>
        </div>
      </div>

      <div className="premium-card">
        <div className="search-filter-bar">
          <div className="search-input-wrapper">
            <Search size={18} />
            <input 
              type="text" 
              placeholder="Search by name, email or phone..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-select-wrapper">
            <Filter size={18} />
            <select 
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {['new', 'contacted', 'interested', 'negotiating', 'converted', 'cold'].map(s => (
                  <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div style={{ marginLeft: 'auto', color: 'var(--gray-text)', fontSize: '0.85rem', fontWeight: 600 }}>
             Showing {leads.length} of {totalCount} leads
          </div>
        </div>

        <div className="table-wrapper">
          <table className="epic8-table">
            <thead>
              <tr>
                <th>Lead Prospect</th>
                <th>Course Interest</th>
                <th>Pipeline Status</th>
                <th>Last Activity</th>
                <th>Follow-up</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '60px' }}>
                    <div className="spinner" style={{ margin: '0 auto 16px' }}></div>
                    <span>Fetching leads...</span>
                </td></tr>
              ) : leads.length > 0 ? (
                leads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    style={{ cursor: 'pointer', background: lead.overdue ? 'rgba(239, 68, 68, 0.02)' : '' }}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                  >
                    <td>
                        <div className="table-primary-text">{lead.full_name}</div>
                        <div className="table-secondary-text">{lead.email}</div>
                    </td>
                    <td className="table-primary-text">{lead.course_interest}</td>
                    <td><span className={`status-badge status-${lead.status}`}>{lead.status.toUpperCase()}</span></td>
                    <td className="table-secondary-text">{new Date(lead.last_activity_at).toLocaleDateString()}</td>
                    <td style={{ color: lead.overdue ? 'var(--error)' : 'inherit', fontWeight: lead.overdue ? 700 : 400 }}>
                        {lead.follow_up_date ? new Date(lead.follow_up_date).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        {lead.status === 'converted' && (
                          <button 
                            className="icon-btn"
                            onClick={(e) => { e.stopPropagation(); handleSendInvite(lead.id); }}
                            title="Send Registration Invite"
                          >
                            <Mail size={16} />
                          </button>
                        )}
                        <button 
                          className="icon-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingLeadId(lead.id);
                            setShowDeleteConfirm(true);
                          }}
                          title="Delete Lead"
                        >
                          <Trash2 size={16} color="var(--error)" />
                        </button>
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }}>
                            <ChevronRight size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '60px' }}>No leads found matching your criteria.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="search-filter-bar" style={{ justifyContent: 'center', gap: '8px', background: 'var(--white)' }}>
             <button className="icon-btn" disabled={page === 1} onClick={() => setPage(page-1)}>Prev</button>
             <span style={{ margin: '0 1rem', fontSize: '0.85rem', fontWeight: 600 }}>Page {page} of {totalPages}</span>
             <button className="icon-btn" disabled={page === totalPages} onClick={() => setPage(page+1)}>Next</button>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '32px', borderRadius: '20px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>Delete Lead Record?</h3>
            <p style={{ color: 'var(--gray-text)', marginBottom: '24px' }}>This action is permanent and will remove all follow-up history associated with this prospect.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="icon-btn-text" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="btn-premium-primary" style={{ background: 'var(--error)' }} onClick={confirmDeleteLead}>
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsListPage;
