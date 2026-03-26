import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { courseApi } from '../api/courseApi';
import { Plus, Book, Calendar, Users, Briefcase, ChevronRight } from 'lucide-react';
import '../styles/epic05.css'; 

const CoursesPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            setLoading(true);
            const data = await courseApi.listCourses();
            setCourses(data.courses || []);
        } catch (err) {
            setError('Failed to fetch courses. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = (courseId) => {
        if (user?.role === 'trainer' || user?.role === 'hr' || user?.role === 'super_admin') {
            navigate(`/trainer/course/${courseId}`);
        } else {
            // Student or other view
            alert('Full syllabus view is being optimized. Please check back shortly.');
        }
    };

    if (loading) return (
        <div className="epic05-container flex items-center justify-center h-screen">
            <div className="spinner"></div>
            <span style={{ marginLeft: '1rem', color: '#64748b' }}>Loading directory...</span>
        </div>
    );

    return (
        <div className="epic05-container">
            <header className="premium-header">
                <div>
                    <h1>Academy Course Directory</h1>
                    <p>Browse through our extensive curriculum and detailed syllabus</p>
                </div>
                <div style={{ color: 'var(--indigo-primary)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                    <Briefcase size={20} />
                    <span>LMS Directory</span>
                </div>
            </header>

            {error && <div className="alert alert-error">{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '1.5rem' }}>
                {courses.length > 0 ? (
                    courses.map(course => (
                        <div key={course.id} className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: 'none', background: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ background: 'var(--indigo-soft)', padding: '10px', borderRadius: '10px', color: 'var(--indigo-primary)' }}>
                                    <Book size={24} />
                                </div>
                                <span className={`badge-premium ${course.is_active ? 'badge-active' : 'badge-draft'}`}>
                                    {course.is_active ? 'Active' : 'Archived'}
                                </span>
                            </div>
                            
                            <div>
                                <h3 style={{ fontWeight: 800, fontSize: '1.25rem', color: '#1e293b', marginBottom: '8px' }}>{course.title}</h3>
                                <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5, minHeight: '3rem' }}>
                                    {course.description || 'Step-by-step curriculum for advanced practitioner training.'}
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem 0', borderTop: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: '#475569' }}>
                                    <Calendar size={14} />
                                    <span>{course.duration_weeks} Weeks Duration</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: '#475569' }}>
                                    <Users size={14} />
                                    <span>{course.active_batch_count || 0} Live Batches</span>
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Course Fee</span>
                                    <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--indigo-primary)' }}>₹{parseFloat(course.base_fee).toLocaleString()}</span>
                                </div>
                                <button 
                                    className="btn-premium-primary" 
                                    style={{ padding: '0.5rem 1rem', fontSize: '0.8125rem' }}
                                    onClick={() => handleViewDetails(course.id)}
                                >
                                    {user?.role !== 'student' ? 'Manage Modules' : 'View Syllabus'}
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="full-width">
                        <div className="empty-state-container">
                            <Book size={48} />
                            <h2>No courses available</h2>
                            <p>Check back later for newly launched programs.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CoursesPage;
