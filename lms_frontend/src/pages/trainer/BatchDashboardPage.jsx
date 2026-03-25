import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';
import { 
    Users, 
    TrendingUp, 
    AlertCircle, 
    CheckCircle2, 
    UserPlus, 
    BarChart3, 
    Calendar, 
    MessageCircle,
    ArrowUpRight,
    Search
} from 'lucide-react';
import '../../styles/epic05.css';

const BatchDashboardPage = () => {
    const { batchId } = useParams();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, [batchId]);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const data = await axiosInstance.get(`/api/analytics/batches/${batchId}`);
            setStats(data || null);
        } catch (err) {
            console.error('Failed to load batch stats');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
            <div className="epic05-container flex items-center justify-center h-screen">
                <div className="spinner"></div>
                <span style={{ marginLeft: '1rem', color: '#64748b' }}>Analyzing batch data...</span>
            </div>
    );

    return (
        <div className="epic05-container">
            {/* Header */}
            <header className="premium-header">
                <div>
                    <h1>Batch Analytics</h1>
                    <p>Monitoring progress and performance for Batch ID: {batchId}</p>
                </div>
                <button className="btn-premium-primary">
                    <MessageCircle size={20} />
                    Notify Students
                </button>
            </header>

            {/* Performance Widgets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
                <div className="premium-card" style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ background: '#eef2ff', color: '#4f46e5', padding: '12px', borderRadius: '12px' }}><Users size={24} /></div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Students</span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats?.students?.length || 0}</div>
                    </div>
                </div>
                <div className="premium-card" style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ background: '#ecfdf5', color: '#10b981', padding: '12px', borderRadius: '12px' }}><BarChart3 size={24} /></div>
                    <div>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Active Tasks</span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats?.students?.[0]?.total_assigned || 0}</div>
                    </div>
                </div>
            </div>

            {/* Students List Table */}
            <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontWeight: 800, fontSize: '1.125rem' }}>Student Roster & Performance</h3>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Student Name</th>
                            <th style={{ textAlign: 'left', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Completion Log</th>
                            <th style={{ textAlign: 'left', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Pending Work</th>
                            <th style={{ textAlign: 'right', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Direct Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(stats?.students || []).map(student => {
                            const pendingCount = (student.total_assigned || 0) - (student.completed_count || 0);
                            return (
                                <tr key={student.student_id} style={{ borderBottom: '1px solid #f1f5f9' }} className="hover:bg-slate-50">
                                    <td style={{ padding: '1.5rem' }}>
                                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{student.student_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{student.student_id}</div>
                                    </td>
                                    <td style={{ padding: '1.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569', fontWeight: 700 }}>
                                            <CheckCircle2 size={16} color="#22c55e" />
                                            {student.completed_count} / {student.total_assigned} Tasks Finished
                                        </div>
                                    </td>
                                    <td style={{ padding: '1.5rem' }}>
                                        {pendingCount > 0 ? (
                                            <span style={{ padding: '6px 12px', background: '#fef2f2', color: '#ef4444', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 900 }}>
                                                {pendingCount} PENDING ASSIGNMENTS
                                            </span>
                                        ) : (
                                            <span style={{ padding: '6px 12px', background: '#f0fdf4', color: '#22c55e', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 900 }}>
                                                UP TO DATE
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '1.5rem', textAlign: 'right' }}>
                                        <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8125rem' }}>
                                            View Student Profile
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BatchDashboardPage;
