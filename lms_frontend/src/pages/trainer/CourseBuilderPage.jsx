import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';
import { 
    Plus, 
    GripVertical, 
    Edit2, 
    Trash2, 
    ChevronRight, 
    ChevronDown, 
    BookOpen,
    FileText,
    Video,
    MoreHorizontal,
    Layout,
    TrendingUp,
    X
} from 'lucide-react';
import '../../styles/epic05.css';

const CourseBuilderPage = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const [course, setCourse] = useState(null);
    const [modules, setModules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeModule, setActiveModule] = useState(null);

    // Modals
    const [showModuleModal, setShowModuleModal] = useState(false);
    const [showSubModuleModal, setShowSubModuleModal] = useState(false);
    const [batchForm, setBatchForm] = useState({ title: '', description: '' });
    const [subForm, setSubForm] = useState({ title: '', objective: '' });

    useEffect(() => {
        fetchCourseData();
    }, [courseId]);

    const fetchCourseData = async () => {
        try {
            setLoading(true);
            const courseData = await courseApi.getCourse(courseId);
            const moduleData = await courseApi.getModules(courseId);
            setCourse(courseData);
            setModules(moduleData.modules || []);
            if (moduleData.modules?.length > 0 && !activeModule) {
                setActiveModule(moduleData.modules[0]);
            }
        } catch (err) {
            console.error('Failed to load course builder data');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateModule = async (e) => {
        e.preventDefault();
        try {
            await courseApi.createModule(courseId, batchForm);
            setShowModuleModal(false);
            setBatchForm({ title: '', description: '' });
            fetchCourseData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create module');
        }
    };

    const handleCreateSubModule = async (e) => {
        e.preventDefault();
        try {
            await courseApi.createSubModule(courseId, activeModule.id, subForm);
            setShowSubModuleModal(false);
            setSubForm({ title: '', objective: '' });
            fetchCourseData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to create sub-module');
        }
    };

    if (loading) return (
        <div className="epic05-container flex items-center justify-center h-screen">
            <div className="spinner"></div>
            <span style={{ marginLeft: '1rem', color: '#64748b' }}>Initializing builder...</span>
        </div>
    );

    return (
        <div className="epic05-container">
            {/* Header */}
            <header className="premium-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--indigo-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                        <Layout size={18} />
                        <span>Curriculum Designer</span>
                    </div>
                    <h1>{course?.title || 'Course Builder'}</h1>
                    <p>Design the learning path, modules, and sub-modules</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className="btn-secondary" onClick={() => navigate(-1)}>Back</button>
                    <button className="btn-premium-primary" onClick={() => setShowModuleModal(true)}>
                        <Plus size={20} />
                        Add New Module
                    </button>
                </div>
            </header>

            {/* Builder Layout */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) 1fr', gap: '2rem' }}>
                {/* Modules Sidebar Card */}
                <div className="premium-card" style={{ height: 'fit-content' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontWeight: 700 }}>Course Modules</h3>
                        <span className="badge-premium" style={{ background: '#f1f5f9', color: '#475569' }}>
                            {modules.length} Total
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {modules.map((mod, idx) => (
                            <div
                                key={mod.id}
                                onClick={() => setActiveModule(mod)}
                                style={{
                                    padding: '1rem',
                                    borderRadius: '0.75rem',
                                    cursor: 'pointer',
                                    border: '1px solid',
                                    borderColor: activeModule?.id === mod.id ? 'var(--indigo-primary)' : 'transparent',
                                    background: activeModule?.id === mod.id ? 'var(--indigo-soft)' : '#f8fafc',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}
                            >
                                <div style={{ color: activeModule?.id === mod.id ? 'var(--indigo-primary)' : '#94a3b8' }}>
                                    <GripVertical size={18} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: activeModule?.id === mod.id ? '#1e293b' : '#64748b' }}>
                                        Module {idx + 1}
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: activeModule?.id === mod.id ? 'var(--indigo-primary)' : '#1e293b' }}>
                                        {mod.title}
                                    </div>
                                </div>
                                <ChevronRight size={18} style={{ color: '#94a3b8' }} />
                            </div>
                        ))}

                        {modules.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                                No modules created yet.
                            </div>
                        )}

                        <button
                            className="btn-link"
                            onClick={() => setShowModuleModal(true)}
                            style={{ marginTop: '1rem', padding: '0.75rem', border: '1px dashed #cbd5e1', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <Plus size={16} />
                            Add Module
                        </button>
                    </div>
                </div>

                {/* Module Details / Sub-modules Area */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {activeModule ? (
                        <>
                            <div className="premium-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                    <div>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{activeModule.title}</h2>
                                        <p style={{ color: '#64748b' }}>Configure sub-modules and lessons for this module</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn-secondary" style={{ padding: '8px' }}><Edit2 size={18} /></button>
                                        <button className="btn-secondary" style={{ padding: '8px', color: '#ef4444' }}><Trash2 size={18} /></button>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '1rem', marginBottom: '2rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                                        <BookOpen size={16} />
                                        <span>Sub-modules: {activeModule.sub_modules?.length || 0}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                                        <TrendingUp size={16} />
                                        <span>Est. Duration: 12 Hours</span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h3 style={{ fontWeight: 700 }}>Curriculum Structure</h3>
                                    <button
                                        className="btn-premium-primary"
                                        onClick={() => setShowSubModuleModal(true)}
                                        style={{ padding: '8px 16px', fontSize: '0.875rem' }}
                                    >
                                        <Plus size={16} />
                                        Add Sub-module
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {(activeModule.sub_modules || []).map((sm, idx) => (
                                        <div key={sm.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', border: '1px solid #f1f5f9', borderRadius: '1rem', transition: 'all 0.2s' }} className="hover:border-indigo-200">
                                            <div style={{ width: '40px', height: '40px', background: '#f8fafc', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#94a3b8' }}>
                                                {idx + 1}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{sm.title}</div>
                                                <div style={{ display: 'flex', gap: '1rem', marginTop: '4px' }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Video size={12} /> Video & Lessons
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <FileText size={12} /> Resources
                                                    </span>
                                                </div>
                                            </div>
                                            <button className="btn-secondary" onClick={() => navigate(`/trainer/course/${courseId}/module/${activeModule.id}/content/${sm.id}`)}>
                                                Manage Content
                                            </button>
                                        </div>
                                    ))}

                                    {(!activeModule.sub_modules || activeModule.sub_modules.length === 0) && (
                                        <div className="empty-state-container" style={{ padding: '2rem' }}>
                                            <p>No sub-modules defined for this module yet.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="empty-state-container" style={{ height: '400px' }}>
                            <div className="empty-state-icon">
                                <Layout size={48} />
                            </div>
                            <h2>Select a Module</h2>
                            <p>Choose a module from the sidebar to view and manage its structure.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Create Module Modal */}
            {showModuleModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Add New Module</h2>
                            <button onClick={() => setShowModuleModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleCreateModule} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label>Module Title*</label>
                                <input
                                    type="text"
                                    className="premium-form-input"
                                    required
                                    placeholder="e.g. Fundamental Principles"
                                    value={batchForm.title}
                                    onChange={e => setBatchForm({...batchForm, title: e.target.value})}
                                />
                            </div>
                            <div className="form-group">
                                <label>Module Description</label>
                                <textarea
                                    className="premium-form-input"
                                    style={{ minHeight: '100px' }}
                                    placeholder="Overview of what this module covers..."
                                    value={batchForm.description}
                                    onChange={e => setBatchForm({...batchForm, description: e.target.value})}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="submit" className="btn-premium-primary" style={{ flex: 1 }}>Create Module</button>
                                <button type="button" className="btn-secondary" onClick={() => setShowModuleModal(false)} style={{ flex: 1 }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Create Sub-Module Modal */}
            {showSubModuleModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Add Sub-module</h2>
                            <button onClick={() => setShowSubModuleModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>
                        <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>Adding to: <strong>{activeModule.title}</strong></p>
                        <form onSubmit={handleCreateSubModule} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label>Sub-module Title*</label>
                                <input
                                    type="text"
                                    className="premium-form-input"
                                    required
                                    placeholder="e.g. Lesson 1: Introduction"
                                    value={subForm.title}
                                    onChange={e => setSubForm({...subForm, title: e.target.value})}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="submit" className="btn-premium-primary" style={{ flex: 1 }}>Create Sub-module</button>
                                <button type="button" className="btn-secondary" onClick={() => setShowSubModuleModal(false)} style={{ flex: 1 }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CourseBuilderPage;
