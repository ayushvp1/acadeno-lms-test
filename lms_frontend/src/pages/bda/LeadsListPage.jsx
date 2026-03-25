import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { registrationApi } from '../../api/registrationApi';
import '../../styles/leads.css';

const LeadsListPage = () => {
  const [leads, setLeads] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;
  const [deletingLeadId, setDeletingLeadId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const navigate = useNavigate();

  const handleSendInvite = async (leadId) => {
    try {
      const response = await axiosInstance.post(`/api/leads/${leadId}/convert`);
      alert(response.data.message || 'Registration link sent successfully!');
    } catch (err) {
      console.error('Failed to send invite:', err);
      alert(err.response?.data?.error || 'Failed to send registration link.');
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

  // Debounced Search Effect
  useEffect(() => {
    const handler = setTimeout(() => {
      setPage(1); // Reset to first page on new search
      fetchLeads(search, status, 1);
    }, 400); // 400ms debounce

    return () => clearTimeout(handler);
  }, [search, status, fetchLeads]);

  // Pagination Change Effect
  useEffect(() => {
    if (page > 1) {
       fetchLeads(search, status, page);
    }
  }, [page, fetchLeads]); // Only trigger on page change if not resetting

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleDeleteLead = async (leadId, leadName) => {
    setDeletingLeadId(leadId);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteLead = async () => {
    if (!deletingLeadId) return;
    
    try {
      await registrationApi.deleteLead(deletingLeadId);
      alert('Lead deleted successfully');
      // Refresh the leads list
      fetchLeads(search, status, page);
    } catch (err) {
      console.error('Failed to delete lead:', err);
      alert(err.response?.data?.error || 'Failed to delete lead');
    } finally {
      setDeletingLeadId(null);
      setShowDeleteConfirm(false);
    }
  };

  const cancelDeleteLead = () => {
    setDeletingLeadId(null);
    setShowDeleteConfirm(false);
  };

  return (
    <div className="leads-container">
      <div className="page-header">
        <h1>Lead Management</h1>
        <button className="btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/leads/new')}>
          + New Lead
        </button>
      </div>

      <div className="lead-controls">
        <input 
          type="text" 
          placeholder="Search by name, email or phone..." 
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select 
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="interested">Interested</option>
          <option value="negotiating">Negotiating</option>
          <option value="converted">Converted</option>
          <option value="cold">Cold</option>
        </select>
      </div>

      <div className="leads-table-container">
        <table className="leads-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact Info</th>
              <th>Course Interest</th>
              <th>Status</th>
              <th>Last Activity</th>
              <th>Follow-up</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>Loading leads...</td></tr>
            ) : leads.length > 0 ? (
              leads.map((lead) => (
                <tr 
                  key={lead.id} 
                  className={lead.overdue ? 'overdue-row' : ''}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                >
                  <td><strong>{lead.full_name}</strong></td>
                  <td>
                    <div style={{ fontSize: '12px' }}>{lead.email}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-text)' }}>{lead.phone}</div>
                  </td>
                  <td>{lead.course_interest}</td>
                  <td><span className={`status-badge status-${lead.status}`}>{lead.status}</span></td>
                  <td>{new Date(lead.last_activity_at).toLocaleDateString()}</td>
                  <td>{lead.follow_up_date ? new Date(lead.follow_up_date).toLocaleDateString() : 'None'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-link" onClick={(e) => { e.stopPropagation(); navigate(`/leads/${lead.id}`); }}>Details</button>
                      {lead.status === 'converted' && (
                        <button 
                          className="btn-secondary btn-sm"
                          style={{ fontSize: '11px', padding: '4px 8px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendInvite(lead.id);
                          }}
                        >
                          Send Link
                        </button>
                      )}
                      <button 
                        className="btn-delete btn-sm"
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteLead(lead.id, lead.full_name);
                        }}
                        title="Delete Lead"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>No leads found matching your criteria.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button 
            className="pagination-btn" 
            disabled={page === 1}
            onClick={() => handlePageChange(page - 1)}
          >
            Prev
          </button>
          {[...Array(totalPages)].map((_, i) => (
            <button 
              key={i + 1}
              className={`pagination-btn ${page === i + 1 ? 'active' : ''}`}
              onClick={() => handlePageChange(i + 1)}
            >
              {i + 1}
            </button>
          ))}
          <button 
            className="pagination-btn" 
            disabled={page === totalPages}
            onClick={() => handlePageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={cancelDeleteLead}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Lead</h3>
            <p>Are you sure you want to delete this lead? This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancelDeleteLead}>
                Cancel
              </button>
              <button className="btn-delete" onClick={confirmDeleteLead}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsListPage;
