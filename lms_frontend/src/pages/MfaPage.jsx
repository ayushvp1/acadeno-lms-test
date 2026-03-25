import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';

const MfaPage = () => {
  const { login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [trustDevice, setTrustDevice] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);
  const inputRefs = useRef([]);

  const email = location.state?.email;

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  if (!email) {
    return <Navigate to="/login" replace />;
  }

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleChange = (index, e) => {
    const value = e.target.value;
    if (isNaN(value)) return;

    const newOtp = [...otp];
    // Take only the last entered character if multiple pasted
    newOtp[index] = value.substring(value.length - 1);
    setOtp(newOtp);

    // Auto focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');
    if (pastedData.some(isNaN)) return;
    
    const newOtp = [...otp];
    pastedData.forEach((char, i) => { if (i < 6) newOtp[i] = char; });
    setOtp(newOtp);
    
    const nextEmptyIndex = Math.min(newOtp.findIndex(val => val === '') === -1 ? 5 : newOtp.findIndex(val => val === ''), 5);
    inputRefs.current[nextEmptyIndex].focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const otpValue = otp.join('');
    if (otpValue.length !== 6 || timeLeft <= 0) return;

    setErrorMsg('');
    setIsLoading(true);

    try {
      const response = await axiosInstance.post('/api/auth/verify-mfa', {
        email,
        otp: otpValue,
        trust_device: trustDevice
      });
      
      const { user, accessToken } = response.data;
      login(user, accessToken);
      navigate('/dashboard');
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
        setErrorMsg('MFA verification failed.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isComplete = otp.every(digit => digit !== '');

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-logo">ACADENO LMS</h1>
        <p className="auth-subtitle">Verify your identity</p>
        
        {errorMsg && <div className="alert alert-error">{errorMsg}</div>}
        
        <div className={`timer ${timeLeft <= 60 ? 'danger' : 'safe'}`}>
          {timeLeft > 0 ? `Code expires in: ${formatTime(timeLeft)}` : 'Code expired'}
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="otp-container">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => inputRefs.current[i] = el}
                type="text"
                inputMode="numeric"
                className="otp-box"
                value={digit}
                onChange={e => handleChange(i, e)}
                onKeyDown={e => handleKeyDown(i, e)}
                onPaste={handlePaste}
                disabled={timeLeft <= 0 || isLoading}
                autoFocus={i === 0}
              />
            ))}
          </div>

          <label className="trust-device-label">
            <input 
              type="checkbox" 
              checked={trustDevice}
              onChange={e => setTrustDevice(e.target.checked)}
              disabled={timeLeft <= 0 || isLoading}
            /> 
            Trust this device for future logins
          </label>

          <button type="submit" className="btn-primary" disabled={timeLeft <= 0 || !isComplete || isLoading}>
            {isLoading ? <div className="spinner"></div> : 'Verify Setup'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MfaPage;
