import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { hrAdminApi } from '../../api/hrAdminApi';
import { Search, Filter, Mail, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import '../../styles/epic8.css';

const EnrollmentsPage = () => {
    const [enrollments, setEnrollments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterBatch, setFilterBatch] = useState('');
    const [filterPayment, setFilterPayment] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        fetchEnrollments();
    }, [filterBatch, filterPayment]);

    const fetchEnrollments = async () => {
        try {
            setLoading(true);
            const params = {
                batch_id: filterBatch,
                payment_status: filterPayment
            };
            const data = await hrAdminApi.listEnrollments(params);
            setEnrollments(data.enrollments || []);
        } catch (err) {
            console.error('Failed to load enrollments');
        } finally {
            setLoading(false);
        }
    };

    const filtered = enrollments.filter(e => 
        e.student_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.registration_number?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return (
        <div className="epic8-loader-container">
            <div className="spinner"></div>
            <span>Loading enrollment records...</span>
        </div>
    );

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div>
                    <h1>Enrollment Management</h1>
                    <p>Track learner progress, payment status, and program allocation</p>
                </div>
            </div>

            <div className="premium-card">
                <div className="search-filter-bar">
                    <div className="search-input-wrapper">
                        <Search size={18} />
                        <input 
                            type="text" 
                            placeholder="Search by student name or reg. number..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="filter-select-wrapper">
                        <Filter size={18} />
                        <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}>
                            <option value="">All Payments</option>
                            <option value="pending">Pending Payment</option>
                            <option value="partial">Partial Paid</option>
                            <option value="full">Fully Paid</option>
                        </select>
                    </div>
                </div>

                <div className="table-wrapper">
                    <table className="epic8-table">
                        <thead>
                            <tr>
                                <th>Student details</th>
                                <th>Registration</th>
                                <th>Batch / Program</th>
                                <th>Progress</th>
                                <th>Payment</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(enrollment => (
                                <tr key={enrollment.id}>
                                    <td>
                                        <div className="table-primary-text">{enrollment.student_name}</div>
                                        <div className="table-secondary-text" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Mail size={12} /> {enrollment.student_email}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="badge-outline">{enrollment.registration_number}</div>
                                        <div className="table-secondary-text" style={{ fontSize: '0.75rem' }}>
                                            Reg: {enrollment.registered_on ? new Date(enrollment.registered_on).toLocaleDateString() : 'N/A'}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="table-primary-text">{enrollment.batch_name}</div>
                                        <div className="table-secondary-text">{enrollment.course_name}</div>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div className="progress-bar-small">
                                                <div 
                                                    className="progress-fill" 
                                                    style={{ width: `${enrollment.completion_pct}%` }}
                                                />
                                            </div>
                                            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{enrollment.completion_pct}%</span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`status-badge status-${enrollment.payment_status}`}>
                                            {enrollment.payment_status === 'full' ? <CheckCircle size={14} /> : <Clock size={14} />}
                                            {enrollment.payment_status?.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`status-pill status-${enrollment.status}`}>
                                            {enrollment.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default EnrollmentsPage;
