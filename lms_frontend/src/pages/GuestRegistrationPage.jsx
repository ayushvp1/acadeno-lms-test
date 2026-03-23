// ==========================================================================
// ACADENO LMS — Guest Registration Page (US-REG-GUEST-01)
// ==========================================================================
// Public page accessed via a one-time invite link:
//   /register?token=<INVITE_TOKEN>
//
// Flow:
//   1. Read ?token= from URL params.
//   2. POST /api/auth/validate-registration-token → receive a short-lived
//      wizard access JWT (role: lead_registrant, 4 h expiry).
//   3. Store the JWT in axiosInstance (no cookie, in-memory only).
//   4. Activate guestMode in RegistrationContext.
//   5. Render the full 5-step Registration Wizard inside a minimal layout.
//
// The guest has NO access to any other part of the platform — the JWT only
// unlocks the /api/registration/* wizard endpoints.
// ==========================================================================

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { setAccessToken } from '../api/axiosInstance';
import { RegistrationProvider, useRegistration } from '../context/RegistrationContext';
import { WizardProgressBar } from './steps/WizardProgressBar';
import { PersonalDetailsStep } from './steps/PersonalDetailsStep';
import { AddressDocumentsStep } from './steps/AddressDocumentsStep';
import { AcademicQualificationsStep } from './steps/AcademicQualificationsStep';
import { CourseBatchStep } from './steps/CourseBatchStep';
import { ReviewSubmitStep } from './steps/ReviewSubmitStep';

// ---------------------------------------------------------------------------
// Inner Wizard — rendered once the invite token is validated.
// Wrapped inside RegistrationProvider so it can access context.
// ---------------------------------------------------------------------------
const GuestWizard = ({ leadName, email }) => {
  const { currentStep, setGuestMode, formData, setFormData } = useRegistration();

  // Mark the session as guest so ReviewSubmitStep shows the right success screen
  useEffect(() => {
    setGuestMode(true);
    if (!formData.personal_details?.email) {
      setFormData(prev => ({
        ...prev,
        personal_details: {
          ...prev.personal_details,
          first_name: leadName || '',
          email: email || ''
        }
      }));
    }
  }, [setGuestMode, leadName, email]);

  const renderActiveStep = () => {
    switch (currentStep) {
      case 1:  return <PersonalDetailsStep />;
      case 2:  return <AddressDocumentsStep />;
      case 3:  return <AcademicQualificationsStep />;
      case 4:  return <CourseBatchStep />;
      case 5:  return <ReviewSubmitStep />;
      default: return <PersonalDetailsStep />;
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      padding: '64px 16px' 
    }}>
      {/* Minimal header — no navigation links for guests */}
      <div style={{
        maxWidth: '860px',
        margin: '0 auto 48px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 8px'
      }}>
        <div>
          <h1 style={{ 
            fontSize: '32px', 
            fontWeight: 800,
            color: 'var(--navy-bg)', 
            letterSpacing: '-1.2px', 
            margin: 0 
          }}>
            Academy Enrollment
          </h1>
          {leadName && (
            <p style={{ color: 'var(--gray-text)', fontSize: '16px', marginTop: '8px' }}>
              Welcome, <strong>{leadName}</strong>. Let's get you registered.
            </p>
          )}
        </div>
        <div style={{
          padding: '10px 18px',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          border: '2px solid rgba(37, 99, 235, 0.2)',
          borderRadius: '30px',
          fontSize: '13px',
          color: 'var(--primary-blue)',
          fontWeight: '700',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.1)'
        }}>
          🛡️ Secure Portal
        </div>
      </div>

      <div style={{ 
        maxWidth: '860px', 
        margin: '0 auto',
        paddingBottom: '80px'
      }}>
        <WizardProgressBar />
        <div style={{ marginTop: '32px' }}>
          {renderActiveStep()}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// GuestRegistrationPage — outer shell that validates the invite token first.
// ---------------------------------------------------------------------------
const GuestRegistrationPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('validating'); // 'validating' | 'valid' | 'invalid'
  const [leadName, setLeadName] = useState('');
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setErrorMessage('No invitation token found in the URL. Please use the link sent to your email.');
      setStatus('invalid');
      return;
    }

    const validate = async () => {
      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL || ''}/api/auth/validate-registration-token`,
          { token }
        );

        // Store the wizard JWT so axiosInstance attaches it to all API calls
        setAccessToken(response.data.accessToken);
        setLeadName(response.data.lead_name || '');
        setEmail(response.data.email || '');
        setStatus('valid');
      } catch (err) {
        const msg = err.response?.data?.error
          || 'This registration link has expired or is invalid. Please contact your representative.';
        setErrorMessage(msg);
        setStatus('invalid');
      }
    };

    validate();
  }, [token]);

  // ---- Validating (spinner) ----
  if (status === 'validating') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
        <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ marginTop: '20px', color: '#64748b', fontSize: '15px' }}>Verifying your invitation link…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ---- Invalid / expired ----
  if (status === 'invalid') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '24px' }}>
        <div style={{ maxWidth: '480px', textAlign: 'center', padding: '48px 32px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 24px' }}>✕</div>
          <h2 style={{ fontSize: '22px', color: '#1e3a5f', marginBottom: '12px' }}>Link Expired or Invalid</h2>
          <p style={{ color: '#64748b', fontSize: '15px', lineHeight: '1.6', marginBottom: '0' }}>{errorMessage}</p>
        </div>
      </div>
    );
  }

  // ---- Valid — render the wizard ----
  return (
    <RegistrationProvider>
      <GuestWizard leadName={leadName} email={email} />
    </RegistrationProvider>
  );
};

export default GuestRegistrationPage;
