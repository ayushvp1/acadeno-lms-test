import React, { useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useNavigate, Link } from 'react-router-dom';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      await axiosInstance.post('/api/auth/forgot-password', { email });
      setSuccessMsg(`If your email exists in our system, an OTP has been sent.`);
      setTimeout(() => navigate('/reset-password', { state: { email } }), 2000);
    } catch (err) {
      if (err.response?.status === 429) {
        setErrorMsg('Too many attempts. Wait 15 minutes.');
      } else {
        setErrorMsg('An error occurred. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-logo">ACADENO LMS</h1>
        <p className="auth-subtitle">Account Recovery</p>
        
        {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label>Registered Email</label>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </span>
              <input 
                type="email" 
                className="auth-input has-icon"
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="you@example.com"
                required 
                disabled={isLoading || !!successMsg}
              />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={isLoading || !email || !!successMsg}>
            {isLoading ? <div className="spinner"></div> : 'Send Reset Code'}
          </button>
        </form>

        <div style={{ marginTop: '20px' }}>
          <Link to="/login" className="btn-link">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
