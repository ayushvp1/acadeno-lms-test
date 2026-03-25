import React, { useState, useEffect } from 'react';
import { hrAdminApi } from '../../api/hrAdminApi';
import { Settings, Lock, Edit2, CheckCircle, AlertTriangle } from 'lucide-react';
import '../../styles/epic8.css';

const SystemSettingsPage = () => {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editKey, setEditKey] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [showPassModal, setShowPassModal] = useState(false);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const data = await hrAdminApi.listSettings();
            setSettings(data.settings || []);
        } catch (err) {
            console.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async () => {
        try {
            const data = { value: editValue };
            if (editKey.is_sensitive) data.current_password = password;
            
            await hrAdminApi.updateSetting(editKey.key, data);
            setEditKey(null);
            setPassword('');
            setShowPassModal(false);
            fetchSettings();
        } catch (err) {
            alert('Update failed: Check your password for sensitive fields.');
        }
    };

    if (loading) return <div className="epic8-loader-container"><div className="spinner"></div></div>;

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div>
                    <h1>System Configuration</h1>
                    <p>Manage global parameters, financial rates, and security tokens</p>
                </div>
            </div>

            <div className="premium-card">
                <div className="table-wrapper">
                    <table className="epic8-table">
                        <thead>
                            <tr>
                                <th>Setting Key</th>
                                <th>Value</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {settings.map(s => (
                                <tr key={s.key}>
                                    <td>
                                        <div className="table-primary-text">{s.key}</div>
                                        {s.is_sensitive && <span className="badge-trainer"><Lock size={12} /> Sensitive</span>}
                                    </td>
                                    <td>
                                        {editKey?.key === s.key ? (
                                            <input 
                                                className="form-group input" 
                                                style={{ width: '200px' }} 
                                                value={editValue} 
                                                onChange={(e) => setEditValue(e.target.value)} 
                                            />
                                        ) : (
                                            <span className="badge-outline">{s.value}</span>
                                        )}
                                    </td>
                                    <td className="table-secondary-text">{s.description}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        {editKey?.key === s.key ? (
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button className="icon-btn" onClick={() => {
                                                    if (s.is_sensitive) setShowPassModal(true);
                                                    else handleUpdate();
                                                }}>
                                                    <CheckCircle size={20} color="var(--success)" />
                                                </button>
                                                <button className="icon-btn" onClick={() => setEditKey(null)}>
                                                    <AlertTriangle size={20} color="var(--error)" />
                                                </button>
                                            </div>
                                        ) : (
                                            <button className="icon-btn" onClick={() => {
                                                setEditKey(s);
                                                setEditValue(s.value === '••••••••' ? '' : s.value);
                                            }}>
                                                <Edit2 size={18} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Password Modal */}
            {showPassModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium" style={{ maxWidth: '400px', textAlign: 'center' }}>
                        <Lock size={48} color="var(--primary-blue)" style={{ marginBottom: '1.5rem' }} />
                        <h2>Sensitive Action</h2>
                        <p style={{ color: 'var(--gray-text)', marginBottom: '2rem' }}>Please verify your administrator password to update this secure parameter.</p>
                        <div className="input-with-icon" style={{ marginBottom: '1.5rem' }}>
                            <input 
                                type={showPassword ? "text" : "password"} 
                                className="premium-search-input has-peek" 
                                style={{ paddingLeft: '1rem', width: '100%' }}
                                placeholder="Verify Admin Password..."
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button 
                                type="button" 
                                className="input-peek-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex="-1"
                                style={{ top: '50%', transform: 'translateY(-50%)' }}
                            >
                                {showPassword ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                )}
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn-premium-primary" style={{ flex: 1 }} onClick={handleUpdate}>Confirm</button>
                            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowPassModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SystemSettingsPage;
