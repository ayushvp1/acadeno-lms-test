import React, { useState } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { useNavigate } from 'react-router-dom';
import { FeeSummaryCard } from './FeeSummaryCard';

export const ReviewSubmitStep = () => {
  const { formData, submitFinal, setMode, setCurrentStep, mode, isLoading, error } = useRegistration();
  const navigate = useNavigate();
  const [consent, setConsent] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(null);

  const pd = formData.personal_details || {};
  const ad = formData.address_documents || {};
  const ac = formData.academic || {};
  const cb = formData.course_batch || {};

  const handleEditClick = (stepIndex) => {
    // When review screen 'Edit' is clicked, we change mode to 'edit' 
    // to allow traversing steps and preserving draftId.
    setMode('edit');
    setCurrentStep(stepIndex);
  };

  const handleFinalSubmit = async () => {
    const result = await submitFinal(consent);
    if (result) {
      setSubmissionSuccess(result);
    }
  };

  if (submissionSuccess) {
    return (
      <div className="step-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: 'var(--success-bg)', color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', margin: '0 auto 24px' }}>✓</div>
        <h2 style={{ fontSize: '24px', color: 'var(--navy-bg)', marginBottom: '12px' }}>Registration Submitted!</h2>
        <p style={{ color: 'var(--gray-text)', marginBottom: '8px' }}>Registration Number: <strong style={{ color: 'var(--text-dark)' }}>{submissionSuccess.registration_number}</strong></p>
        <p style={{ color: 'var(--gray-text)', marginBottom: '32px' }}>A payment link has been sent to the student's email.</p>
        <button className="btn-primary" style={{ maxWidth: '200px', margin: '0 auto' }} onClick={() => navigate('/registrations')}>
          View Registrations List
        </button>
      </div>
    );
  }

  const isViewOnly = mode === 'view';

  return (
    <div className="step-card">
      <div className="step-header">
        <h2 className="step-title">Review & Submit</h2>
        <p className="step-subtitle">Please verify all details before final submission.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="review-section">
        <div className="review-section-header">
          <h3 className="review-section-title">1. Personal Details</h3>
          {!isViewOnly && <button className="btn-link" onClick={() => handleEditClick(1)}>Edit</button>}
        </div>
        <div className="review-grid">
          <div className="review-item"><span className="review-label">Name</span><span className="review-value">{pd.first_name} {pd.last_name}</span></div>
          <div className="review-item"><span className="review-label">Email</span><span className="review-value">{pd.email}</span></div>
          <div className="review-item"><span className="review-label">Phone</span><span className="review-value">{pd.phone}</span></div>
          <div className="review-item"><span className="review-label">DOB</span><span className="review-value">{pd.date_of_birth?.split('T')[0]}</span></div>
          {pd.emergency_contact_name && (
            <div className="review-item"><span className="review-label">Emergency Contact</span><span className="review-value">{pd.emergency_contact_name} ({pd.emergency_contact_relationship}) - {pd.emergency_contact_phone}</span></div>
          )}
        </div>
      </div>

      <div className="review-section">
        <div className="review-section-header">
          <h3 className="review-section-title">2. Address & Identity</h3>
          {!isViewOnly && <button className="btn-link" onClick={() => handleEditClick(2)}>Edit</button>}
        </div>
        <div className="review-grid">
          <div className="review-item"><span className="review-label">Address</span><span className="review-value">{ad.address_line1}, {ad.address_line2}</span></div>
          <div className="review-item"><span className="review-label">Location</span><span className="review-value">{ad.city}, {ad.state} - {ad.pin_code}</span></div>
          {ad.aadhaar_number && <div className="review-item"><span className="review-label">Aadhaar</span><span className="review-value">{ad.aadhaar_number}</span></div>}
          {ad.pan_number && <div className="review-item"><span className="review-label">PAN</span><span className="review-value">{ad.pan_number}</span></div>}
        </div>
      </div>

      <div className="review-section">
        <div className="review-section-header">
          <h3 className="review-section-title">3. Academic Qualifications</h3>
          {!isViewOnly && <button className="btn-link" onClick={() => handleEditClick(3)}>Edit</button>}
        </div>
        <div className="review-grid">
          <div className="review-item"><span className="review-label">Qualification</span><span className="review-value">{ac.qualification}</span></div>
          <div className="review-item"><span className="review-label">Institution</span><span className="review-value">{ac.institution} ({ac.year_of_passing})</span></div>
          {ac.score && <div className="review-item"><span className="review-label">Score</span><span className="review-value">{ac.score}</span></div>}
        </div>
      </div>

      <div className="review-section">
        <div className="review-section-header">
          <h3 className="review-section-title">4. Course Selection</h3>
          {!isViewOnly && <button className="btn-link" onClick={() => handleEditClick(4)}>Edit</button>}
        </div>
        <div className="review-grid">
          <div className="review-item full-width"><span className="review-label">Course</span><span className="review-value">{cb.course_name}</span></div>
          <div className="review-item full-width"><span className="review-label">Batch</span><span className="review-value">{cb.batch_name} ({cb.schedule})</span></div>
        </div>
        <FeeSummaryCard feeDetails={cb} />
      </div>

      {!isViewOnly && (
        <>
          <label className="trust-device-label" style={{ justifyContent: 'flex-start', margin: '32px 0', fontSize: '15px' }}>
            <input 
              type="checkbox" 
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span style={{ color: 'var(--text-dark)' }}>
              I confirm that the student has read and agreed to the <a href="#" style={{ color: 'var(--primary-blue)', textDecoration: 'underline' }}>Privacy Notice</a> under DPDP Act requirements.
            </span>
          </label>

          <div className="wizard-actions">
            <button className="btn-secondary" onClick={() => handleEditClick(4)}>Back</button>
            <button 
              className="btn-primary" 
              onClick={handleFinalSubmit} 
              disabled={isLoading || !consent} 
              style={{ width: 'auto', padding: '12px 32px' }}
            >
              {isLoading ? <div className="spinner"></div> : 'Confirm & Submit'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
