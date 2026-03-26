import React, { useEffect, useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import '../../styles/student.css';

const StudentDashboardPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const response = await axiosInstance.get('/api/student/dashboard');
                setData(response.data);
            } catch (err) {
                console.error('Failed to fetch dashboard:', err);
                setError(err.response?.data?.error || 'Failed to load dashboard.');
            } finally {
                setLoading(false);
            }
        };
        fetchDashboard();
    }, []);

    if (loading) return <div className="student-loading">Loading your dashboard...</div>;
    if (error) return <div className="student-error">{error}</div>;

    return (
        <div className="student-dashboard">
            <header className="dashboard-header">
                <h1>Welcome back, <span className="highlight">{data.first_name}!</span></h1>
                <p>Track your student journey and course progress</p>
            </header>

            <div className="dashboard-grid">
                {/* Profile Card */}
                <div className="dashboard-card profile-card">
                    <h2>Academic Profile</h2>
                    <div className="profile-info">
                        <div className="info-row">
                            <span className="label">Full Name:</span>
                            <span className="value">{data.first_name} {data.last_name || ''}</span>
                        </div>
                        <div className="info-row">
                            <span className="label">Email:</span>
                            <span className="value">{data.email}</span>
                        </div>
                        <div className="info-row">
                            <span className="label">Reg. Number:</span>
                            <span className="value">{data.registration_number}</span>
                        </div>
                    </div>
                </div>

                {/* Enrollment Card */}
                <div className="dashboard-card enrollment-card">
                    <h2>Current Enrollment</h2>
                    <div className="status-badge-container">
                        <span className={`status-badge ${data.enrollment_status}`}>
                            {data.enrollment_status.replace('_', ' ')}
                        </span>
                    </div>
                    <div className="course-info">
                        <h3>{data.course_name}</h3>
                        <p className="batch-name">Batch: {data.batch_name}</p>
                    </div>
                    {data.enrollment_status === 'pending_payment' && (
                        <div className="payment-callout">
                            <p>Complete your payment to activate your account</p>
                            <button className="btn-primary" onClick={() => window.location.href = `/payment/${data.enrollment_id}`}>
                                Pay Now (₹{data.total_fee})
                            </button>
                        </div>
                    )}
                </div>

                {/* Quick Stats or Next Steps */}
                <div className="dashboard-card status-card">
                    <h2>Learning Progress</h2>
                    <div className="progress-container">
                        <div className="stat-item">
                            <span className="stat-label">Course Status</span>
                            <span className="stat-value">{data.enrollment_status === 'active' ? 'Active' : 'Locked'}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">Modules Completed</span>
                            <span className="stat-value">0 / 12</span>
                        </div>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: '0%' }}></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentDashboardPage;
