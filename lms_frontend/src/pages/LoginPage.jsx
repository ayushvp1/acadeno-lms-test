import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [lockedUntil, setLockedUntil] = useState(null);
  const [countdown, setCountdown] = useState('');

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    let interval;
    if (lockedUntil) {
      interval = setInterval(() => {
        const now = new Date().getTime();
        const lockTime = new Date(lockedUntil).getTime();
        const distance = lockTime - now;

        if (distance <= 0) {
          clearInterval(interval);
          setLockedUntil(null);
          setCountdown('');
          setErrorMsg('');
        } else {
          const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((distance % (1000 * 60)) / 1000);
          setCountdown(`${minutes}m ${seconds}s`);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lockedUntil || isLoading) return;
    
    setErrorMsg('');
    setIsLoading(true);

    try {
      const response = await axiosInstance.post('/api/auth/login', { email, password });
      
      if (response.data.mfa_required) {
        navigate('/mfa', { state: { email } });
      } else {
        const { user, accessToken } = response.data;
        login(user, accessToken);
        navigate(from, { replace: true });
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 423) {
        setLockedUntil(data.locked_until);
        setErrorMsg('Account locked. Try again later.');
      } else if (status === 401) {
        setErrorMsg('Invalid credentials. Please try again.');
      } else if (status === 429) {
        setErrorMsg('Too many attempts. Wait 15 minutes.');
      } else if (data?.error) {
        setErrorMsg(data.error);
      } else {
        setErrorMsg('Login failed. Please try again later.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-logo">ACADENO LMS</h1>
        <p className="auth-subtitle">Sign in to your learning portal</p>
        
        {errorMsg && (
          <div className="alert alert-error">
            {errorMsg} {countdown && <strong>({countdown})</strong>}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label>Email Address</label>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
              </span>
              <input 
                type="email" 
                className="auth-input has-icon" 
                placeholder="you@example.com"
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
                disabled={!!lockedUntil || isLoading}
              />
            </div>
          </div>

          <div className="input-group">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <label>Password</label>
              <Link to="/forgot-password" className="btn-link" tabIndex="-1">Forgot Password?</Link>
            </div>
            <div className="input-with-icon">
              <span className="input-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              </span>
              <input 
                type="password" 
                className="auth-input has-icon" 
                placeholder="••••••••"
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
                disabled={!!lockedUntil || isLoading}
              />
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={!!lockedUntil || isLoading || !email || !password}>
            {isLoading ? <div className="spinner"></div> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
