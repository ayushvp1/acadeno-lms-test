import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import '../../styles/leads.css';

const NewLeadPage = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    course_interest: '',
    lead_source: '',
    notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [duplicateLead, setDuplicateLead] = useState(null);

  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
    setDuplicateLead(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setDuplicateLead(null);
    setError(null);

    try {
      const response = await axiosInstance.post('/api/leads', formData);
      navigate(`/leads/${response.data.lead.id}`);
    } catch (err) {
      if (err.response?.status === 409) {
        setDuplicateLead(err.response.data.existing_lead);
      } else {
        setError(err.response?.data?.error || 'Failed to create lead. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="leads-container">
      <div className="page-header">
        <h1>Create New Lead</h1>
        <button className="btn-link" onClick={() => navigate(-1)}>Back</button>
      </div>

      <div className="form-card">
        <h2 className="form-title">Lead Information</h2>

        {error && <div className="alert alert-error">{error}</div>}
        
        {duplicateLead && (
          <div className="alert alert-error" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <strong>Duplicate Lead Detected!</strong>
            <p style={{ margin: '8px 0' }}>
              A lead with this email or phone already exists: <strong>{duplicateLead.full_name}</strong>
            </p>
            <Link to={`/leads/${duplicateLead.id}`} className="btn-link" style={{ fontWeight: '600' }}>
              View Existing Lead →
            </Link>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Full Name *</label>
            <input 
              type="text" name="full_name" required 
              className="auth-input" placeholder="e.g. John Doe"
              value={formData.full_name} onChange={handleChange} 
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="input-group">
              <label>Email Address *</label>
              <input 
                type="email" name="email" required 
                className="auth-input" placeholder="john@example.com"
                value={formData.email} onChange={handleChange} 
              />
            </div>
            <div className="input-group">
              <label>Phone Number (10 digits) *</label>
              <input 
                type="tel" name="phone" required pattern="\d{10}"
                className="auth-input" placeholder="9876543210"
                value={formData.phone} onChange={handleChange} 
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="input-group">
              <label>Course Interest *</label>
              <select 
                name="course_interest" required 
                className="auth-input" 
                value={formData.course_interest} onChange={handleChange}
              >
                <option value="">Select Course</option>
                <option value="Full Stack React">Full Stack React</option>
                <option value="Python Data Science">Python Data Science</option>
                <option value="DevOps Masterclass">DevOps Masterclass</option>
                <option value="UI/UX Design">UI/UX Design</option>
              </select>
            </div>
            <div className="input-group">
              <label>Lead Source *</label>
              <select 
                name="lead_source" required 
                className="auth-input"
                value={formData.lead_source} onChange={handleChange}
              >
                <option value="">Select Source</option>
                <option value="Website Form">Website Form</option>
                <option value="Instagram Ads">Instagram Ads</option>
                <option value="LinkedIn Cold Reach">LinkedIn Cold Reach</option>
                <option value="Referral">Referral</option>
                <option value="Walk-in">Walk-in</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label>Initial Notes (Optional)</label>
            <textarea 
              name="notes" className="auth-input" 
              placeholder="Any specific requirements or context..."
              style={{ minHeight: '100px', resize: 'vertical' }}
              value={formData.notes} onChange={handleChange}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <div className="spinner" /> : 'Create Lead'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewLeadPage;
