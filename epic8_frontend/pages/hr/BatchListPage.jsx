import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hrAdminApi } from '../../api/hrAdminApi';
import { Plus, Search, Filter, Eye, Edit2, Calendar, Users } from 'lucide-react';
import '../../styles/epic8.css';

const BatchListPage = () => {
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchBatches();
    }, []);

    const fetchBatches = async () => {
        try {
            setLoading(true);
            const data = await hrAdminApi.listBatches();
            setBatches(data.batches || []);
        } catch (err) {
            console.error('Failed to load batches');
        } finally {
            setLoading(false);
        }
    };

    const filteredBatches = batches.filter(batch => {
        const matchesSearch = batch.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             batch.batch_code?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus ? batch.status === filterStatus : true;
        return matchesSearch && matchesStatus;
    });

    if (loading) return (
        <div className="epic8-loader-container">
            <div className="spinner"></div>
            <span>Loading academy cohorts...</span>
        </div>
    );

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div>
                    <h1>Batch Management</h1>
                    <p>Plan and monitor learning cohorts across all programs</p>
                </div>
                <button className="btn-premium-primary" onClick={() => navigate('/batches/new')}>
                    <Plus size={18} />
                    Create New Batch
                </button>
            </div>

            <div className="premium-card" style={{ marginBottom: '2rem' }}>
                <div className="search-filter-bar">
                    <div className="search-input-wrapper">
                        <Search size={18} />
                        <input 
                            type="text" 
                            placeholder="Search by name or code..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-select-wrapper">
                        <Filter size={18} />
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                            <option value="">All Statuses</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                </div>

                <div className="table-wrapper">
                    <table className="epic8-table">
                        <thead>
                            <tr>
                                <th>Cohort Detials</th>
                                <th>Schedule</th>
                                <th>Capacity</th>
                                <th>Trainer</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBatches.map(batch => (
                                <tr key={batch.id}>
                                    <td>
                                        <div className="table-primary-text">{batch.name}</div>
                                        <div className="table-secondary-text">{batch.batch_code} • {batch.course_name}</div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Calendar size={14} color="var(--primary-blue)" />
                                            <span style={{ fontSize: '0.85rem' }}>{new Date(batch.start_date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="table-secondary-text">{batch.schedule_type} • {batch.class_time_start}</div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Users size={14} color="var(--gray-text)" />
                                            <span>{batch.enrolled_count || 0} / {batch.capacity}</span>
                                        </div>
                                        <div className="progress-bar-small">
                                            <div 
                                                className="progress-fill" 
                                                style={{ width: `${Math.min((batch.enrolled_count || 0) / batch.capacity * 100, 100)}%` }}
                                            />
                                        </div>
                                    </td>
                                    <td>
                                        {batch.trainer_email ? (
                                            <span className="badge-trainer">{batch.trainer_email.split('@')[0]}</span>
                                        ) : (
                                            <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>UNASSIGNED</span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`status-badge status-${batch.status}`}>
                                            {batch.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button className="icon-btn" onClick={() => navigate(`/batches/${batch.id}`)}>
                                                <Eye size={18} />
                                            </button>
                                            <button className="icon-btn">
                                                <Edit2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {filteredBatches.length === 0 && (
                        <div className="empty-state">
                            <Calendar size={48} />
                            <h3>No batches found</h3>
                            <p>Try adjusting your filters or search terms.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BatchListPage;
