import React, { useState, useRef } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';

const ResetPasswordPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const initialEmail = location.state?.email || '';
  const [email] = useState(initialEmail);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef([]);

  if (!initialEmail) {
    return <Navigate to="/forgot-password" replace />;
  }

  // OTP handlers
  const handleOtpChange = (index, e) => {
    const value = e.target.value;
    if (isNaN(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1].focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  // Password strength checker
  const calculateStrength = (pass) => {
    let score = 0;
    if (!pass) return { score: 0, color: 'var(--gray-border)', text: 'None' };
    if (pass.length > 7) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/\d/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score < 2) return { score, color: 'var(--error)', text: 'Weak' };
    if (score === 3) return { score, color: '#f59e0b', text: 'Fair' };
    return { score, color: 'var(--success)', text: 'Strong' };
  };

  const strength = calculateStrength(newPassword);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length !== 6 || isLoading) return;

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    if (strength.score < 4) {
      setErrorMsg('Password must be at least 8 characters with upper, digit & special.');
      return;
    }

    setErrorMsg('');
    setIsLoading(true);
    
    try {
      const response = await axiosInstance.post('/api/auth/reset-password', { email, otp: otpValue, newPassword });
      setSuccessMsg(response.data.message);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'OTP_EXPIRED') {
        setErrorMsg('OTP expired. Request a new one.');
      } else if (data?.code === 'OTP_INVALID') {
        setErrorMsg('Invalid OTP. Please try again.');
        setOtp(['', '', '', '', '', '']);
        inputRefs.current[0].focus();
      } else if (data?.error) {
        setErrorMsg(data.error);
      } else {
        setErrorMsg('Reset failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isComplete = otp.every(digit => digit !== '');

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: '480px' }}>
        <h1 className="auth-logo">ACADENO LMS</h1>
        <p className="auth-subtitle">Create a securely strong password</p>
        
        {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label>6-Digit Reset Code (from <strong>{email}</strong>)</label>
            <div className="otp-container">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={el => inputRefs.current[i] = el}
                  type="text"
                  inputMode="numeric"
                  className="otp-box"
                  value={digit}
                  onChange={e => handleOtpChange(i, e)}
                  onKeyDown={e => handleOtpKeyDown(i, e)}
                  disabled={isLoading || !!successMsg}
                  autoFocus={i === 0}
                />
              ))}
            </div>
          </div>

          <div className="input-group">
            <label>New Password</label>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </span>
              <input 
                type="password" 
                className="auth-input has-icon"
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                disabled={isLoading || !!successMsg}
                placeholder="Minimum 8 characters"
                required 
              />
            </div>
            {newPassword.length > 0 && (
              <div className="password-strength">
                <div className="strength-bar" style={{ backgroundColor: strength.score >= 1 ? strength.color : '' }}></div>
                <div className="strength-bar" style={{ backgroundColor: strength.score >= 2 ? strength.color : '' }}></div>
                <div className="strength-bar" style={{ backgroundColor: strength.score >= 3 ? strength.color : '' }}></div>
                <div className="strength-bar" style={{ backgroundColor: strength.score >= 4 ? strength.color : '' }}></div>
              </div>
            )}
            <div className="strength-text" style={{ color: strength.color }}>
               {newPassword.length > 0 ? strength.text : ''}
            </div>
          </div>

          <div className="input-group">
            <label>Confirm Password</label>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </span>
              <input 
                type="password" 
                className="auth-input has-icon"
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                disabled={isLoading || !!successMsg}
                placeholder="Re-enter password"
                required 
              />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={isLoading || !isComplete || !newPassword || !confirmPassword || !!successMsg}>
            {isLoading ? <div className="spinner"></div> : 'Confirm Reset Setup'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
