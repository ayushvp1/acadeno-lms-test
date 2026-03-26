import React, { useState, useEffect } from 'react';
import { hrAdminApi } from '../../api/hrAdminApi';
import { TrendingUp, Users, Calendar, DollarSign, ArrowRight, BarChart2 } from 'lucide-react';
import '../../styles/epic8.css';

const AnalyticsDashboardPage = () => {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        try {
            setLoading(true);
            const data = await hrAdminApi.getAnalytics();
            setAnalytics(data.analytics);
        } catch (err) {
            console.error('Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="epic8-loader-container">
            <div className="spinner"></div>
            <span>Loading system analytics...</span>
        </div>
    );

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div>
                    <h1>System Analytics</h1>
                    <p>Business intelligent insights into academy performance and growth</p>
                </div>
                <div className="date-display">
                    <Calendar size={18} />
                    <span>Real-time Data: {new Date().toLocaleDateString()}</span>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="stat-grid">
                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary-blue)' }}>
                        <Users size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Total Active Students</h3>
                        <div className="stat-value">{analytics?.total_students}</div>
                        <div className="stat-trend trend-up">
                            <TrendingUp size={14} /> +12.5% this month
                        </div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                        <DollarSign size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Revenue this Month</h3>
                        <div className="stat-value">${analytics?.revenue_this_month.toLocaleString()}</div>
                        <div className="stat-trend trend-up">
                            <TrendingUp size={14} /> +8.2% this month
                        </div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>
                        <Calendar size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Active Batches</h3>
                        <div className="stat-value">{analytics?.active_batches}</div>
                        <div className="stat-trend trend-stable">
                            Stable growth rate
                        </div>
                    </div>
                </div>
            </div>

            <div className="analytics-layout">
                {/* Enrollments by Course */}
                <div className="premium-card chart-card">
                    <div className="card-header-flex">
                        <h2>Enrollments by Course</h2>
                        <button className="icon-btn-text">View Detailed <ArrowRight size={14} /></button>
                    </div>
                    <div className="bar-chart-container">
                        {analytics?.enrollments_by_course.map((item, id) => (
                            <div key={id} className="bar-item">
                                <div className="bar-label-group">
                                    <span className="bar-label">{item.course}</span>
                                    <span className="bar-value">{item.count}</span>
                                </div>
                                <div className="bar-bg">
                                    <div 
                                        className="bar-fill" 
                                        style={{ width: `${(item.count / 50) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Registration Trend */}
                <div className="premium-card trend-card">
                    <div className="card-header-flex">
                        <h2>Registration Trend</h2>
                        <BarChart2 size={18} color="var(--gray-text)" />
                    </div>
                    <div className="trend-lines-wrapper">
                        {analytics?.monthly_trend.map((point, id) => (
                            <div key={id} className="trend-month">
                                <div 
                                    className="trend-point" 
                                    style={{ height: `${point.registrations * 2}px` }}
                                >
                                    <span className="trend-tooltip">{point.registrations} leads</span>
                                </div>
                                <span className="trend-label">{point.month}</span>
                            </div>
                        ))}
                    </div>
                    <p style={{ marginTop: 'auto', fontSize: '0.75rem', color: 'var(--gray-text)', textAlign: 'center' }}>
                        * Monthly lead-to-registration conversion performance (90-day period)
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsDashboardPage;
