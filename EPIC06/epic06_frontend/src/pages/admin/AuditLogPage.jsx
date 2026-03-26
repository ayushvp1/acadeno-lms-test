import React, { useState, useEffect } from 'react';
import { hrAdminApi } from '../../api/hrAdminApi';
import { 
    Search, Filter, Calendar, ClipboardList, 
    User, Activity, ShieldCheck, AlertCircle, 
    Database, Cpu
} from 'lucide-react';
import '../../styles/epic8.css';

const AuditLogPage = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        actionType: '',
        userId: ''
    });

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const data = await hrAdminApi.getAuditLogs(filters);
            setLogs(data.logs || []);
        } catch (err) {
            console.error('Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    };

    const getStatusBadge = (status) => {
        if (status === 'success') {
            return <span className="badge-trainer"><ShieldCheck size={12} /> SUCCESS</span>;
        }
        return <span className="badge-outline" style={{ color: 'var(--error)', borderColor: 'var(--error)' }}><AlertCircle size={12} /> FAILURE</span>;
    };

    if (loading && logs.length === 0) return <div className="epic8-loader-container"><div className="spinner"></div></div>;

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div>
                    <h1>System Audit Trail</h1>
                    <p>Monitor platform actions, investigate incidents, and maintain compliance</p>
                </div>
                <div className="header-stats">
                    <div className="header-stat-item">
                        <Cpu size={20} />
                        <div>
                            <div className="stat-value">{logs.length}</div>
                            <div className="stat-label">Recent Logs</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="premium-card">
                <div className="search-filter-bar" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                    <div className="filter-select-wrapper">
                        <Calendar size={18} />
                        <input 
                            type="date" 
                            title="Start Date"
                            value={filters.startDate} 
                            onChange={(e) => setFilters({...filters, startDate: e.target.value})} 
                        />
                    </div>
                    <div className="filter-select-wrapper">
                        <Calendar size={18} />
                        <input 
                            type="date" 
                            title="End Date"
                            value={filters.endDate} 
                            onChange={(e) => setFilters({...filters, endDate: e.target.value})} 
                        />
                    </div>
                    <div className="filter-select-wrapper">
                        <Activity size={18} />
                        <select 
                            value={filters.actionType} 
                            onChange={(e) => setFilters({...filters, actionType: e.target.value})}
                        >
                            <option value="">All Actions</option>
                            <option value="LOGIN">Logins</option>
                            <option value="REGISTER">Registrations</option>
                            <option value="PAYMENT">Payments</option>
                            <option value="COURSE_UPDATE">Course Changes</option>
                            <option value="BATCH_START">Batch Alerts</option>
                        </select>
                    </div>
                    <button className="btn-premium-primary" onClick={fetchLogs}>
                        <Search size={18} />
                        Search Records
                    </button>
                </div>

                <div className="table-wrapper">
                    <table className="epic8-table">
                        <thead>
                            <tr>
                                <th>Timestamp & Actor</th>
                                <th>Action Category</th>
                                <th>Resource Impacted</th>
                                <th>Result</th>
                                <th>Origin IP</th>
                                <th style={{ textAlign: 'right' }}>Metadata</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-text)' }}>
                                        No audit records found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id}>
                                        <td>
                                            <div className="table-primary-text">{new Date(log.created_at).toLocaleString()}</div>
                                            <div className="table-secondary-text" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <User size={12} /> {log.actor_name || log.actor_email} ({log.actor_role})
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: 600, color: 'var(--primary-blue)' }}>{log.action_type}</div>
                                        </td>
                                        <td>
                                            <div className="table-primary-text">{log.resource_type}</div>
                                            <div className="table-secondary-text">{log.resource_id ? `#${log.resource_id.substring(0,8)}` : 'System-wide'}</div>
                                        </td>
                                        <td>{getStatusBadge(log.status)}</td>
                                        <td>
                                            <span className="badge-outline">{log.ip_address}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button 
                                                className="icon-btn" 
                                                onClick={() => alert(JSON.stringify(log.details, null, 2))}
                                                title="View Details"
                                            >
                                                <ClipboardList size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AuditLogPage;
