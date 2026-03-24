import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { courseApi } from '../../api/courseApi';
import { 
    Plus, 
    Search, 
    Filter, 
    Book, 
    MoreVertical, 
    Calendar, 
    Users, 
    Trash2, 
    Power,
    X,
    TrendingUp
} from 'lucide-react';
import '../../styles/epic05.css';

const CourseManagementPage = () => {
    const { user } = useAuth();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    
    // Form state
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        base_fee: '',
        gst_rate: 18,
        duration_weeks: '',
        max_batch_capacity: 30
    });

    useEffect(() => {
        fetchCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            setLoading(true);
            const data = await courseApi.getCourses();
            setCourses(data.courses || []);
        } catch (err) {
            setError('Failed to load courses. Please try again.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await courseApi.createCourse(formData);
            setShowCreateModal(false);
            fetchCourses();
            setFormData({
                title: '',
                description: '',
                base_fee: '',
                gst_rate: 18,
                duration_weeks: '',
                max_batch_capacity: 30
            });
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create course');
        }
    };

    const toggleStatus = async (courseId) => {
        try {
            await courseApi.deactivateCourse(courseId);
            fetchCourses();
        } catch (err) {
            alert('Failed to update course status');
        }
    };

    const filteredCourses = (courses || []).filter(c => 
        (c.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (c.description?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    if (loading) return (
        <div className="epic05-container flex items-center justify-center h-screen">
            <div className="spinner"></div>
            <span style={{ marginLeft: '1rem', color: '#64748b' }}>Loading courses...</span>
        </div>
    );

    return (
        <div className="epic05-container">
            {/* Header */}
            <header className="premium-header">
                <div>
                    <h1>Course Management</h1>
                    <p>Manage your academy's curriculum, batches, and enrollment</p>
                </div>
                {(user?.role === 'super_admin' || user?.role === 'hr') && (
                    <button onClick={() => setShowCreateModal(true)} className="btn-premium-primary">
                        <Plus size={20} />
                        Create New Course
                    </button>
                )}
            </header>

            {/* Filter & Search Bar */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'center' }}>
                <div className="premium-search-container">
                    <Search className="search-icon" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search courses by title or description..." 
                        className="premium-search-input"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <button className="btn-secondary" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Filter size={18} />
                    Filter
                </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {/* Courses Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                {filteredCourses.length > 0 ? (
                    filteredCourses.map(course => (
                        <div key={course.id} className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ background: 'var(--indigo-soft)', padding: '0.75rem', borderRadius: '0.75rem', color: 'var(--indigo-primary)' }}>
                                    <Book size={24} />
                                </div>
                                <span className={`badge-premium ${course.is_active ? 'badge-active' : 'badge-draft'}`}>
                                    {course.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: '#1e293b' }}>{course.title}</h3>
                                <p style={{ fontSize: '0.875rem', color: '#64748b', lineHeight: 1.5, minHeight: '3rem' }}>
                                    {course.description || 'No description provided.'}
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem 0', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: '#475569' }}>
                                    <Calendar size={16} />
                                    <span>{course.duration_weeks} Weeks</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: '#475569' }}>
                                    <Users size={16} />
                                    <span>Max: {course.max_batch_capacity}</span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Base Fee</span>
                                    <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a' }}>₹{parseFloat(course.base_fee).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        onClick={() => toggleStatus(course.id)}
                                        style={{ background: course.is_active ? '#fee2e2' : '#dcfce7', color: course.is_active ? '#ef4444' : '#10b981', border: 'none', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                                        title={course.is_active ? 'Deactivate' : 'Activate'}
                                    >
                                        <Power size={18} />
                                    </button>
                                    <button className="btn-secondary" style={{ padding: '8px', borderRadius: '8px' }}>
                                        <TrendingUp size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="full-width" style={{ gridColumn: '1 / -1' }}>
                        <div className="empty-state-container">
                            <div className="empty-state-icon">
                                <Book size={48} />
                            </div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>No courses found</h2>
                            <p style={{ maxWidth: '400px', marginBottom: '1.5rem' }}>
                                {searchQuery ? `We couldn't find any courses matching "${searchQuery}"` : "Start by creating your first course to build your academy's curriculum."}
                            </p>
                            <button onClick={() => setShowCreateModal(true)} className="btn-premium-primary">
                                <Plus size={20} />
                                Create New Course
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Create New Course</h2>
                            <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label>Course Title*</label>
                                <input 
                                    type="text" 
                                    className="premium-form-input" 
                                    required 
                                    placeholder="e.g. Advanced Ayurveda Certification"
                                    value={formData.title}
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                />
                            </div>

                            <div className="form-group">
                                <label>Course Description</label>
                                <textarea 
                                    className="premium-form-input" 
                                    style={{ minHeight: '100px', resize: 'vertical' }}
                                    placeholder="Brief overview of the curriculum and objectives..."
                                    value={formData.description}
                                    onChange={e => setFormData({...formData, description: e.target.value})}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div className="form-group">
                                    <label>Base Fee (₹)*</label>
                                    <input 
                                        type="number" 
                                        className="premium-form-input" 
                                        required 
                                        value={formData.base_fee}
                                        onChange={e => setFormData({...formData, base_fee: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Duration (Weeks)*</label>
                                    <input 
                                        type="number" 
                                        className="premium-form-input" 
                                        required 
                                        value={formData.duration_weeks}
                                        onChange={e => setFormData({...formData, duration_weeks: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div className="form-group">
                                    <label>GST Rate (%)</label>
                                    <input 
                                        type="number" 
                                        className="premium-form-input" 
                                        value={formData.gst_rate}
                                        onChange={e => setFormData({...formData, gst_rate: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Max Batch Capacity</label>
                                    <input 
                                        type="number" 
                                        className="premium-form-input" 
                                        value={formData.max_batch_capacity}
                                        onChange={e => setFormData({...formData, max_batch_capacity: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="submit" className="btn-premium-primary" style={{ flex: 1 }}>
                                    <Plus size={20} />
                                    Launch Course
                                </button>
                                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)} style={{ flex: 1 }}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CourseManagementPage;
