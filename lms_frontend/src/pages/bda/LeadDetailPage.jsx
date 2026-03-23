import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import '../../styles/leads.css';

const STATUS_STAGES = ['new', 'contacted', 'interested', 'negotiating', 'converted', 'cold'];
const STATUS_ORDER = { 'new': 0, 'contacted': 1, 'interested': 2, 'negotiating': 3, 'converted': 4, 'cold': 5 };

const LeadDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [lead, setLead] = useState(null);
  const [history, setHistory] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Invite banner — shown after a successful conversion
  const [inviteSent, setInviteSent] = useState(false);

  // Status Change State
  const [newStatus, setNewStatus] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // New Note State
  const [noteText, setNoteText] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await axiosInstance.get(`/api/leads/${id}`);
      setLead(res.data.lead);
      setHistory(res.data.history);
      setNotes(res.data.notes);
      setNewStatus(res.data.lead.status);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    
    // Validate backward transition reason
    const currentIndex = STATUS_ORDER[lead.status];
    const targetIndex = STATUS_ORDER[newStatus];
    if (targetIndex < currentIndex && !statusReason.trim()) {
      alert('A reason is required for moving a lead back to an earlier stage.');
      return;
    }

    setIsUpdatingStatus(true);
    try {
      await axiosInstance.patch(`/api/leads/${id}/status`, { 
        new_status: newStatus, 
        reason: statusReason 
      });
      setStatusReason('');
      fetchData(); // Refresh lead state
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    setIsAddingNote(true);
    try {
      await axiosInstance.post(`/api/leads/${id}/notes`, { 
        note_text: noteText, 
        follow_up_date: followUpDate || null 
      });
      setNoteText('');
      setFollowUpDate('');
      fetchData(); // Refresh and re-fetch notes
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add note');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleConvertToRegistration = async () => {
    if (window.confirm('Are you sure you want to convert this lead? This will lock the record and send a registration link to the lead\'s email.')) {
      try {
        const res = await axiosInstance.post(`/api/leads/${id}/convert`);
        if (res.data.invite_sent) setInviteSent(true);
        fetchData();
      } catch (err) {
        alert(err.response?.data?.error || 'Conversion failed');
      }
    }
  };

  if (loading) return <div className="loading">Loading details...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  const currentIdx = STATUS_ORDER[lead.status];
  const isLocked = lead.is_locked;

  return (
    <div className="leads-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1>{lead.full_name}</h1>
          <span className={`status-badge status-${lead.status}`}>{lead.status}</span>
          {isLocked && <span className="role-badge" style={{ backgroundColor: '#475569' }}>LOCKED</span>}
        </div>
        <button className="btn-link" onClick={() => navigate('/leads')}>← All Leads</button>
      </div>

      {/* Invite-sent confirmation banner */}
      {inviteSent && (
        <div style={{ margin: '0 0 24px', padding: '14px 20px', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>✅</span>
            <div>
              <p style={{ fontWeight: '600', color: '#166534', margin: 0 }}>Registration invite sent!</p>
              <p style={{ color: '#15803d', fontSize: '13px', margin: 0 }}>
                A secure enrollment link has been emailed to <strong>{lead?.email}</strong>. It expires in 7 days.
              </p>
            </div>
          </div>
          <button onClick={() => setInviteSent(false)} style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div className="lead-grid">
        {/* Main Info Column */}
        <div className="detail-card">
          <div className="pipeline-viz">
            {STATUS_STAGES.map((s, idx) => (
              <div 
                key={s} 
                className={`step ${idx <= currentIdx ? 'completed' : ''} ${idx === currentIdx ? 'active' : ''}`}
              >
                <div className="step-circle">{idx + 1}</div>
                <div className="step-label">{s}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--navy-bg)' }}>Contact Information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '15px' }}>
              <div><span style={{ color: 'var(--gray-text)' }}>Email:</span> <strong>{lead.email}</strong></div>
              <div><span style={{ color: 'var(--gray-text)' }}>Phone:</span> <strong>{lead.phone}</strong></div>
              <div><span style={{ color: 'var(--gray-text)' }}>Source:</span> <strong>{lead.lead_source}</strong></div>
              <div><span style={{ color: 'var(--gray-text)' }}>Interest:</span> <strong>{lead.course_interest}</strong></div>
            </div>
          </div>

          {!isLocked && (
            <div style={{ padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
              <h3 style={{ marginBottom: '12px', fontSize: '16px' }}>Status Update</h3>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                <select 
                  className="auth-input" style={{ flex: 1 }}
                  value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                >
                  {STATUS_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                
                {STATUS_ORDER[newStatus] < currentIdx && (
                  <input 
                    type="text" className="auth-input" style={{ flex: 2 }}
                    placeholder="Reason for moving back..."
                    value={statusReason} onChange={(e) => setStatusReason(e.target.value)}
                  />
                )}

                <button 
                  className="btn-primary" style={{ width: 'auto' }}
                  onClick={handleStatusUpdate} disabled={isUpdatingStatus || newStatus === lead.status}
                >
                  Update
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: '40px' }}>
            <h3 style={{ marginBottom: '16px' }}>Interaction History</h3>
            <div className="timeline">
              {notes.map((n) => (
                <div key={n.id} className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div className="note-header">
                    <strong>{n.bda_name}</strong>
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                  <div className="note-text">{n.note_text}</div>
                  {n.follow_up_date && (
                    <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '4px', fontWeight: '500' }}>
                      Next Follow-up: {new Date(n.follow_up_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
              {notes.length === 0 && <div style={{ color: 'var(--gray-text)' }}>No interaction recorded yet.</div>}
            </div>
          </div>

          {!isLocked && (
            <form onSubmit={handleAddNote} style={{ marginTop: '30px' }}>
              <h3 style={{ marginBottom: '12px' }}>Add Note & Follow-up</h3>
              <textarea 
                className="auth-input" placeholder="Type notes about the recent interaction..." required
                style={{ minHeight: '80px', marginBottom: '12px' }}
                value={noteText} onChange={(e) => setNoteText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '12px', color: 'var(--gray-text)' }}>Next Follow-up (Optional)</label>
                  <input 
                    type="date" className="auth-input" 
                    value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </div>
                <button 
                  type="submit" className="btn-primary" style={{ width: '200px', marginTop: '18px' }}
                  disabled={isAddingNote}
                >
                  Add Interaction
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Sidebar Info Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="detail-card" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Actions</h3>
            {['interested', 'negotiating'].includes(lead.status) && !isLocked && (
              <button className="btn-primary" onClick={handleConvertToRegistration} style={{ marginBottom: '12px', background: 'var(--success)' }}>
                Convert to Registration
              </button>
            )}
            <button className="btn-primary" style={{ background: 'var(--navy-bg)' }} onClick={() => window.print()}>
              Print Factsheet
            </button>
          </div>

          <div className="detail-card" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Activity Log</h3>
            <ul style={{ listStyle: 'none', fontSize: '12px', color: 'var(--gray-text)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>Created on {new Date(lead.created_at).toLocaleDateString()}</li>
              <li>Last activity: {new Date(lead.last_activity_at).toLocaleString()}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDetailPage;
