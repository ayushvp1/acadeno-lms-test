// ==========================================================================
// ACADENO LMS — System Settings Page (US-HR-06 Modular)
// ==========================================================================
import React, { useState, useEffect } from 'react';
import { adminApi } from '../../api/adminApi';
import '../../../../styles/hr.css';

const SystemSettingsPage = () => {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [modalKey, setModalKey] = useState(null);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true); setError(null);
    try {
      const data = await adminApi.listSettings();
      setSettings(data.settings);
      const vals = {}; data.settings.forEach(s => { vals[s.key] = s.is_sensitive ? '' : s.value; });
      setEditValues(vals);
    } catch (err) { setError(err.response?.data?.error || 'Failed to load settings'); }
    finally { setLoading(false); }
  };

  const handleValueChange = (key, value) => { setEditValues(prev => ({ ...prev, [key]: value })); };

  const handleSave = async (setting) => {
    setError(null); setSuccess(null);
    if (setting.is_sensitive) { setModalKey(setting.key); return; }
    await doUpdate(setting.key, editValues[setting.key], null);
  };

  const doUpdate = async (key, value, currentPassword) => {
    setSubmitting(true); setError(null);
    try {
      const payload = { value }; if (currentPassword) payload.current_password = currentPassword;
      const data = await adminApi.updateSetting(key, payload);
      setSettings(prev => prev.map(s => s.key === key ? { ...s, ...data.setting } : s));
      setSuccess(`Setting "${key}" updated`); setModalKey(null); setPassword('');
    } catch (err) { setError(err.response?.data?.error || 'Update failed'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="hr-container"><div className="empty-state">Loading settings…</div></div>;

  return (
    <div className="hr-container">
      <div className="page-header">
        <div><h1>System Settings</h1><p style={{ color: 'var(--gray-text)', fontSize: 14 }}>Global platform settings.</p></div>
      </div>
      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}
      <div className="settings-table">
        {settings.map(s => (
          <div key={s.key} className="setting-row">
            <div><div className="setting-key">{s.key}</div>{s.is_sensitive && <span className="badge badge-upcoming" style={{ fontSize: 10 }}>sensitive</span>}</div>
            <div className="setting-value-wrap">
              <input type={s.is_sensitive ? 'password' : 'text'} className="setting-value-input" value={editValues[s.key] ?? ''} placeholder={s.is_sensitive ? '••••••••' : ''} onChange={e => handleValueChange(s.key, e.target.value)} />
              <button className="btn-sm btn-primary-sm" onClick={() => handleSave(s)} disabled={submitting}>Save</button>
            </div>
          </div>
        ))}
      </div>
      {modalKey && (
        <div className="modal-overlay" onClick={() => setModalKey(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <h2>Auth Required</h2>
            <form onSubmit={(e) => { e.preventDefault(); doUpdate(modalKey, editValues[modalKey], password); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Current Password" required autoFocus />
              <div className="form-actions"><button type="submit" className="btn-sm btn-primary-sm" disabled={submitting}>Confirm</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default SystemSettingsPage;
