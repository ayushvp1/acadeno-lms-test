import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { registrationApi } from '../api/registrationApi';

export const RegistrationsListPage = () => {
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await registrationApi.listRegistrations({
        search: searchTerm,
        status: statusFilter,
        limit: 50
      });
      setRegistrations(data.registrations || []);
    } catch (err) {
      setError('Failed to load registrations');
    } finally {
      setLoading(false);
    }
  };

  // Debounced search effect
  useEffect(() => {
    const handler = setTimeout(() => {
      loadData();
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, statusFilter]);

  const handleEdit = (id, status) => {
    if (status === 'active') return; // Locked
    navigate(`/registration/${id}/edit`);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', color: 'var(--navy-bg)', letterSpacing: '-0.5px' }}>
          Registrations
        </h1>
        <button className="btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/registration/new')}>
          + New Registration
        </button>
      </div>

      <div className="data-table-container">
        <div className="data-table-header">
          <input 
            type="text" 
            className="auth-input search-input" 
            placeholder="Search name, email, or Reg No..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select 
            className="auth-input" 
            style={{ width: '200px' }} 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_payment">Pending Payment</option>
            <option value="active">Active (Enrolled)</option>
          </select>
        </div>

        {error && <div className="alert alert-error" style={{ margin: '16px 24px' }}>{error}</div>}

        <table className="data-table">
          <thead>
            <tr>
              <th>Reg. Number</th>
              <th>Student Name</th>
              <th>Course / Batch</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>
                  <div className="spinner" style={{ borderTopColor: 'var(--primary-blue)', margin: '0 auto' }}></div>
                </td>
              </tr>
            ) : registrations.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', color: 'var(--gray-text)', padding: '40px' }}>
                  No registrations found
                </td>
              </tr>
            ) : (
              registrations.map(reg => (
                <tr key={reg.id}>
                  <td style={{ fontWeight: 600, color: 'var(--navy-bg)' }}>{reg.registration_number}</td>
                  <td>
                    <div>{reg.student_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-text)' }}>{reg.email}</div>
                  </td>
                  <td>
                    <div style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={reg.course_name}>
                      {reg.course_name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--gray-text)' }}>{reg.batch_name}</div>
                  </td>
                  <td>
                    <span className={`status-badge status-${reg.status}`}>
                      {reg.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td>{new Date(reg.created_at).toLocaleDateString()}</td>
                  <td>
                    <button 
                      className="btn-link" 
                      onClick={() => handleEdit(reg.id, reg.status)}
                      style={{ color: reg.status === 'active' ? 'var(--gray-text)' : 'var(--primary-blue)', cursor: reg.status === 'active' ? 'not-allowed' : 'pointer' }}
                      title={reg.status === 'active' ? 'Locked (Payment Completed)' : 'Edit Registration'}
                    >
                      {reg.status === 'active' ? '🔒 View' : '✎ Edit'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
