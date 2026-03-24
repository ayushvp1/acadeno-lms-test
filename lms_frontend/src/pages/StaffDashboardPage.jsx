import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { 
    Layout, 
    BookOpen, 
    Users, 
    Clock, 
    Activity, 
    Edit3, 
    Video, 
    Settings,
    ChevronRight,
    Search,
    Filter
} from 'lucide-react';
import '../styles/epic05.css';

const StaffDashboardPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            setLoading(true);
            const res = await axiosInstance.get('/api/registration/courses');
            setCourses(res.data.courses);
            if (res.data.courses.length > 0) {
                // Find first course if none selected
                const firstCourseId = res.data.courses[0].id;
                setSelectedCourse(firstCourseId);
                handleCourseSelect(firstCourseId);
            }
        } catch (err) {
            setError('Failed to load courses');
            setLoading(false);
        }
    };

    const handleCourseSelect = async (courseId) => {
        setLoading(true);
        setSelectedCourse(courseId);
        try {
            const res = await axiosInstance.get(`/api/registration/courses/${courseId}/batches`);
            let filteredBatches = res.data.batches;
            if (user?.role === 'trainer') {
                filteredBatches = filteredBatches.filter(b => b.trainer_id === user.id);
            }
            setBatches(filteredBatches);
        } catch (err) {
            setError('Failed to load batches');
        } finally {
            setLoading(false);
        }
    };

    if (loading && courses.length === 0) return (
        <div className="epic05-container flex items-center justify-center h-screen">
            <div className="spinner"></div>
            <span style={{ marginLeft: '1rem', color: '#64748b' }}>Waking up dashboard...</span>
        </div>
    );

    return (
        <div className="epic05-container">
            {/* Header */}
            <header className="premium-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--indigo-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                        <Activity size={18} />
                        <span>Staff Command Center</span>
                    </div>
                    <h1>{user.role === 'super_admin' ? 'Academy Administrator' : 'Trainer Dashboard'}</h1>
                    <p>Manage your assigned batches, student performance, and live sessions.</p>
                </div>
                {user.role === 'trainer' && (
                    <button 
                        className="btn-premium-primary"
                        onClick={() => navigate(`/trainer/course/${selectedCourse}`)}
                    >
                        <BookOpen size={20} />
                        Curriculum Builder
                    </button>
                )}
            </header>

            {/* Quick Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div className="premium-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--indigo-soft)', color: 'var(--indigo-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Active Batches</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{batches.length}</div>
                    </div>
                </div>
                <div className="premium-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Avg Attendance</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>84%</div>
                    </div>
                </div>
                <div className="premium-card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#fff7ed', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Clock size={24} />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Upcoming Live</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{batches.filter(b => b.is_active).length}</div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="premium-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontWeight: 800 }}>Live Batches & Assignments</h2>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>Filter by Course:</div>
                        <select 
                            value={selectedCourse} 
                            onChange={(e) => handleCourseSelect(e.target.value)}
                            className="premium-form-input"
                            style={{ width: '250px', marginBottom: 0 }}
                        >
                            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                    {batches.length > 0 ? batches.map(batch => (
                        <div 
                            key={batch.id} 
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '2rem', 
                                padding: '1.5rem', 
                                border: '1px solid #f1f5f9', 
                                borderRadius: '1.25rem',
                                background: 'white',
                                transition: 'all 0.3s ease'
                            }}
                            className="hover:shadow-lg hover:border-indigo-100"
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: 800, margin: 0 }}>{batch.name}</h3>
                                    <span className={`badge-premium ${batch.is_active ? 'badge-active' : 'badge-draft'}`}>
                                        {batch.is_active ? 'Active' : 'Paused'}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '1.5rem', color: '#64748b', fontSize: '0.875rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={14} /> {batch.schedule || 'Not scheduled'}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Users size={14} /> {batch.enrolled_count}/{batch.capacity} Students
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button 
                                    className="btn-secondary"
                                    onClick={() => navigate(`/trainer/batch/${batch.id}/dashboard`)}
                                    title="Batch Analytics"
                                >
                                    <Settings size={18} />
                                    <span style={{ marginLeft: '8px' }}>Manage</span>
                                </button>
                                <button 
                                    className="btn-secondary"
                                    onClick={() => navigate(`/trainer/batch/${batch.id}/live-sessions`)}
                                    style={{ color: '#059669', borderColor: '#dcfce7' }}
                                    title="Live Sessions"
                                >
                                    <Video size={18} />
                                    <span style={{ marginLeft: '8px' }}>Live</span>
                                </button>
                                <button 
                                    className="btn-premium-primary"
                                    onClick={() => navigate(`/trainer/course/${selectedCourse}`)}
                                    style={{ padding: '0.75rem 1.25rem' }}
                                >
                                    Builder <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )) : (
                        <div className="empty-state-container" style={{ padding: '4rem' }}>
                            <Activity size={48} />
                            <h2>No batches assigned</h2>
                            <p>You aren't associated with any active batches for this course yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StaffDashboardPage;
