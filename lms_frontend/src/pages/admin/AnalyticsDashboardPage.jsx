import React, { useState, useEffect } from 'react';
import { hrAdminApi } from '../../api/hrAdminApi';
import { TrendingUp, Users, Calendar, DollarSign, ArrowRight, BarChart2, Target, PieChart, Zap, Activity } from 'lucide-react';
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
            <span>Loading performance insights...</span>
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
                    <span>Reference Date: {new Date().toLocaleDateString()}</span>
                </div>
            </div>

            {/* Academic Stat Grid */}
            <div style={{ margin: '0 0 12px 0', fontSize: '11px', fontWeight: 700, color: 'var(--gray-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Academic Performance</div>
            <div className="stat-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(37, 99, 235, 0.1)', color: 'var(--primary-blue)' }}>
                        <Users size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Total Active Students</h3>
                        <div className="stat-value">{analytics?.total_students}</div>
                        <div className="stat-trend trend-up">
                            <TrendingUp size={14} /> +12.5% vs last month
                        </div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}>
                        <DollarSign size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Revenue this Month</h3>
                        <div className="stat-value">₹{analytics?.revenue_this_month.toLocaleString()}</div>
                        <div className="stat-trend trend-up">
                            <TrendingUp size={14} /> +8.2% vs last month
                        </div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' }}>
                        <BarChart2 size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Active Batches</h3>
                        <div className="stat-value">{analytics?.active_batches}</div>
                        <div className="stat-trend trend-stable">
                            Direct academic load
                        </div>
                    </div>
                </div>
            </div>

            {/* Lead Marketing Grid */}
            <div style={{ margin: '24px 0 12px 0', fontSize: '11px', fontWeight: 700, color: 'var(--gray-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Analytics (Leads & Conversion)</div>
            <div className="stat-grid" style={{ marginBottom: '2.5rem' }}>
                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(234, 88, 12, 0.1)', color: '#ea580c' }}>
                        <Target size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Total Market Leads</h3>
                        <div className="stat-value">{analytics?.total_leads}</div>
                        <div className="stat-trend trend-stable">Pipeline awareness</div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(147, 51, 234, 0.1)', color: '#9333ea' }}>
                        <PieChart size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Lead Conversions</h3>
                        <div className="stat-value">{analytics?.converted_leads}</div>
                        <div className="stat-trend trend-up">
                            <TrendingUp size={14} /> {analytics?.conversion_rate}% Conversion Rate
                        </div>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon-wrapper" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
                        <Activity size={24} />
                    </div>
                    <div className="stat-info">
                        <h3>Leads in Progress</h3>
                        <div className="stat-value">{analytics?.total_leads - analytics?.converted_leads}</div>
                        <div className="stat-trend trend-stable">Unconverted pipeline</div>
                    </div>
                </div>
            </div>

            <div className="analytics-layout">
                {/* Registration Trend - Main Chart */}
                <div className="premium-card trend-card">
                    <div className="card-header-flex">
                        <div>
                            <h2>Institutional Growth</h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--gray-text)', marginTop: '4px' }}>Monthly enrollment & lead registration velocity</p>
                        </div>
                        <BarChart2 size={18} color="var(--gray-text)" />
                    </div>
                    <div className="trend-lines-wrapper">
                        {analytics?.monthly_trend.map((point, id) => (
                            <div key={id} className="trend-month">
                                <div 
                                    className="trend-point" 
                                    style={{ height: `${point.registrations * 15 || 10}px` }}
                                >
                                    <span className="trend-tooltip">{point.registrations} Enrollments</span>
                                </div>
                                <span className="trend-label">{point.month}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: '2rem', padding: '1rem 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--gray-text)' }}>
                            <div style={{ width: '10px', height: '10px', background: 'var(--primary-blue)', borderRadius: '2px' }}></div>
                            Enrollments
                        </div>
                    </div>
                </div>

                {/* Vertical Distribution Stack */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* Enrollments by Course */}
                    <div className="premium-card chart-card">
                        <div className="card-header-flex">
                            <h2 style={{ fontSize: '0.95rem' }}>Enrollments by Course</h2>
                            <ArrowRight size={16} color="var(--primary-blue)" style={{ cursor: 'pointer' }} />
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
                                            style={{ width: `${Math.max((item.count / 20) * 100, 5)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Lead Status Pipeline */}
                    <div className="premium-card chart-card">
                        <div className="card-header-flex">
                            <h2 style={{ fontSize: '0.95rem' }}>Lead Status distribution</h2>
                            <Zap size={16} color="#ec4899" />
                        </div>
                        <div className="bar-chart-container">
                            {analytics?.leads_by_status.map((item, id) => (
                                <div key={id} className="bar-item">
                                    <div className="bar-label-group">
                                        <span className="bar-label">{item.status.toUpperCase()}</span>
                                        <span className="bar-value">{item.count}</span>
                                    </div>
                                    <div className="bar-bg">
                                        <div 
                                            className="bar-fill" 
                                            style={{ 
                                                width: `${Math.max((item.count / (analytics.total_leads || 1)) * 100, 5)}%`,
                                                background: 'linear-gradient(to right, #ec4899, #f472b6)'
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsDashboardPage;
