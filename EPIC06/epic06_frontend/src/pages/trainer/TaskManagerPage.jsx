import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { taskApi } from '../../api/taskApi';
import axiosInstance from '../../api/axiosInstance';
import { 
    Plus, 
    ClipboardList, 
    CheckCircle, 
    Clock, 
    AlertCircle, 
    ExternalLink, 
    MoreVertical, 
    Search,
    ChevronRight,
    MessageSquare,
    Trophy,
    Users,
    X,
    Calendar,
    Target
} from 'lucide-react';
import '../../styles/epic05.css';

const TaskManagerPage = () => {
    const { user } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('tasks'); // tasks or submissions
    const [showCreateModal, setShowCreateModal] = useState(false);
    
    // Form State
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        batch_id: '',
        target_student_id: '',
        max_score: 100,
        due_date: '',
        instructions: ''
    });
    const [assignmentType, setAssignmentType] = useState('batch'); // batch or individual
    const [batchStudents, setBatchStudents] = useState([]);

    useEffect(() => {
        fetchData();
        if (showCreateModal && batches.length === 0) {
            fetchBatches();
        }
    }, [view, showCreateModal]);

    const handleBatchChange = async (batchId) => {
        setFormData({ ...formData, batch_id: batchId, target_student_id: '' });
        if (batchId && assignmentType === 'individual') {
            try {
                const res = await axiosInstance.get(`/api/analytics/batches/${batchId}`);
                setBatchStudents(res.data.students || []);
            } catch (err) {
                console.error('Failed to load batch students');
            }
        }
    };

    const handleTypeChange = async (type) => {
        setAssignmentType(type);
        if (type === 'individual' && formData.batch_id) {
            handleBatchChange(formData.batch_id);
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            if (view === 'tasks') {
                const data = await taskApi.getTasks();
                setTasks(data.tasks || []);
            } else {
                setSubmissions([
                    { id: 1, student_name: 'Rahul Kumar', task_title: 'Ayurveda Basics', submitted_at: '2026-03-23', status: 'pending' },
                    { id: 2, student_name: 'Priya Singh', task_title: 'Prakriti Analysis', submitted_at: '2026-03-22', status: 'evaluated', score: 85 }
                ]);
            }
        } catch (err) {
            console.error('Failed to load task data');
        } finally {
            setLoading(false);
        }
    };

    const fetchBatches = async () => {
        try {
            const res = await axiosInstance.get('/api/registration/courses');
            const allCourses = res.data.courses || [];
            let myBatches = [];
            
            for(const course of allCourses) {
                const bRes = await axiosInstance.get(`/api/registration/courses/${course.id}/batches`);
                const filtered = bRes.data.batches.filter(b => b.trainer_id === user.id);
                myBatches = [...myBatches, ...filtered.map(b => ({ ...b, course_title: course.name, course_id: course.id }))];
            }
            setBatches(myBatches);
        } catch (err) {
            console.error('Failed to load batches');
        }
    };

    const handleCreateTask = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            const selectedBatch = batches.find(b => b.id === formData.batch_id);
            if (!selectedBatch) throw new Error('Please select a valid batch');

            await taskApi.createTask({
                ...formData,
                target_student_id: assignmentType === 'individual' ? formData.target_student_id : null,
                course_id: selectedBatch.course_id
            });

            setShowCreateModal(false);
            setFormData({ title: '', description: '', batch_id: '', target_student_id: '', max_score: 100, due_date: '', instructions: '' });
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || err.message || 'Task creation failed');
        } finally {
            setLoading(false);
        }
    };

    if (loading && tasks.length === 0 && !showCreateModal) return (
        <div className="epic05-container flex items-center justify-center h-screen">
            <div className="spinner"></div>
            <span style={{ marginLeft: '1rem', color: '#64748b' }}>Syncing task board...</span>
        </div>
    );

    return (
        <div className="epic05-container">
            {/* Header */}
            <header className="premium-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--indigo-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                        <Trophy size={18} />
                        <span>Assignment Portal</span>
                    </div>
                    <h1>Task & Assignment Manager</h1>
                    <p>Create challenges and evaluate student submissions for your batches</p>
                </div>
                <button onClick={() => setShowCreateModal(true)} className="btn-premium-primary">
                    <Plus size={20} />
                    Create New Task
                </button>
            </header>

            {/* View Switcher */}
            <div style={{ display: 'flex', gap: '2.5rem', marginBottom: '2.5rem', borderBottom: '1px solid #f1f5f9' }}>
                <button 
                    onClick={() => setView('tasks')}
                    className={`nav-tab ${view === 'tasks' ? 'active' : ''}`}
                    style={{ padding: '1rem 0', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', color: view === 'tasks' ? 'var(--indigo-primary)' : '#94a3b8', borderBottom: view === 'tasks' ? '2px solid var(--indigo-primary)' : 'none' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ClipboardList size={20} />
                        Active Tasks
                    </div>
                </button>
                <button 
                    onClick={() => setView('submissions')}
                    className={`nav-tab ${view === 'submissions' ? 'active' : ''}`}
                    style={{ padding: '1rem 0', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', color: view === 'submissions' ? 'var(--indigo-primary)' : '#94a3b8', borderBottom: view === 'submissions' ? '2px solid var(--indigo-primary)' : 'none' }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageSquare size={20} />
                        Student Submissions
                    </div>
                </button>
            </div>

            {view === 'tasks' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                    {tasks.map(task => (
                        <div key={task.id} className="premium-card hover:border-indigo-200 transition-all">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                                <div style={{ background: 'var(--indigo-soft)', padding: '10px', borderRadius: '12px', color: 'var(--indigo-primary)' }}>
                                    <ClipboardList size={20} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {task.target_student_id && (
                                        <span className="badge-premium" style={{ border: '1px solid #fed7aa', color: '#ea580c', background: '#fff7ed' }}>
                                            Personalized
                                        </span>
                                    )}
                                    <span className={`badge-premium ${task.status === 'published' ? 'badge-active' : 'badge-draft'}`}>
                                        {task.status}
                                    </span>
                                </div>
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <h3 style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '6px', color: '#1e293b' }}>{task.title}</h3>
                                <p style={{ fontSize: '0.875rem', color: '#64748b', minHeight: '2.5rem' }}>{task.description}</p>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', fontSize: '0.8125rem', color: '#475569', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={14} /> Due: {new Date(task.due_date).toLocaleDateString()}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Target size={14} /> Max: {task.max_score} Pts</div>
                            </div>
                            <button className="btn-secondary" style={{ width: '100%' }}>Manage Task</button>
                        </div>
                    ))}

                    {tasks.length === 0 && (
                        <div className="full-width">
                            <div className="empty-state-container" style={{ padding: '6rem 2rem' }}>
                                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
                                    <Trophy size={48} color="var(--indigo-primary)" />
                                </div>
                                <h2 style={{ fontWeight: 800 }}>No active tasks found</h2>
                                <p>You haven't assigned any challenges to your students yet.</p>
                                <button onClick={() => setShowCreateModal(true)} className="btn-premium-primary" style={{ marginTop: '2rem' }}>Assign First Task</button>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student</th>
                                <th style={{ textAlign: 'left', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Task</th>
                                <th style={{ textAlign: 'left', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Submitted</th>
                                <th style={{ textAlign: 'left', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                                <th style={{ textAlign: 'right', padding: '1.5rem', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {submissions.map(sub => (
                                <tr key={sub.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{sub.student_name}</td>
                                    <td style={{ padding: '1.5rem', color: '#475569' }}>{sub.task_title}</td>
                                    <td style={{ padding: '1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>{sub.submitted_at}</td>
                                    <td style={{ padding: '1.5rem' }}>
                                        <span className={`badge-premium ${sub.status === 'evaluated' ? 'badge-active' : ''}`} style={{ background: sub.status === 'pending' ? '#fff7ed' : '#dcfce7', color: sub.status === 'pending' ? '#ea580c' : '#16a34a' }}>
                                            {sub.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1.5rem', textAlign: 'right' }}>
                                        <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.8125rem' }}>
                                            {sub.status === 'pending' ? 'Review & Grade' : 'View Feedback'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create Task Modal */}
            {showCreateModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium" style={{ maxWidth: '600px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>Issue New Assignment</h2>
                            <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleCreateTask} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div className="form-group">
                                <label>Target Batch*</label>
                                <select 
                                    className="premium-form-input"
                                    required
                                    value={formData.batch_id}
                                    onChange={e => handleBatchChange(e.target.value)}
                                >
                                    <option value="">Select an active batch</option>
                                    {batches.map(b => (
                                        <option key={b.id} value={b.id}>[{b.course_title}] {b.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Assignment Mode</label>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <label style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: assignmentType === 'batch' ? 'var(--indigo-primary)' : '#e2e8f0', background: assignmentType === 'batch' ? 'var(--indigo-soft)' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="radio" value="batch" checked={assignmentType === 'batch'} onChange={e => handleTypeChange(e.target.value)} style={{ display: assignmentType === 'batch' ? 'block' : 'none' }} />
                                        <span style={{ fontWeight: 600 }}>Whole Batch</span>
                                    </label>
                                    <label style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: assignmentType === 'individual' ? 'var(--indigo-primary)' : '#e2e8f0', background: assignmentType === 'individual' ? 'var(--indigo-soft)' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="radio" value="individual" checked={assignmentType === 'individual'} onChange={e => handleTypeChange(e.target.value)} style={{ display: assignmentType === 'individual' ? 'block' : 'none' }} />
                                        <span style={{ fontWeight: 600 }}>Single Student</span>
                                    </label>
                                </div>
                            </div>

                            {assignmentType === 'individual' && formData.batch_id && (
                                <div className="form-group anim-fade-in">
                                    <label>Select Student*</label>
                                    <select 
                                        className="premium-form-input" 
                                        required 
                                        value={formData.target_student_id}
                                        onChange={e => setFormData({...formData, target_student_id: e.target.value})}
                                    >
                                        <option value="">Select student from batch</option>
                                        {batchStudents.map(s => (
                                            <option key={s.student_id} value={s.student_id}>{s.student_name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="form-group">
                                <label>Task Title*</label>
                                <input 
                                    type="text" 
                                    className="premium-form-input" 
                                    required 
                                    placeholder="e.g. Weekly Assessment: Module 1"
                                    value={formData.title}
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                />
                            </div>

                            <div className="form-group">
                                <label>Short Description</label>
                                <textarea 
                                    className="premium-form-input" 
                                    style={{ minHeight: '80px' }}
                                    placeholder="Provide a brief overview..."
                                    value={formData.description}
                                    onChange={e => setFormData({...formData, description: e.target.value})}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                <div className="form-group">
                                    <label>Due Date*</label>
                                    <input 
                                        type="date" 
                                        className="premium-form-input" 
                                        required 
                                        value={formData.due_date}
                                        onChange={e => setFormData({...formData, due_date: e.target.value})}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Max Score (Pts)*</label>
                                    <input 
                                        type="number" 
                                        className="premium-form-input" 
                                        required 
                                        value={formData.max_score}
                                        onChange={e => setFormData({...formData, max_score: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Detailed Instructions / Questions*</label>
                                <textarea 
                                    className="premium-form-input" 
                                    style={{ minHeight: '120px' }}
                                    required
                                    placeholder="Enter requirements..."
                                    value={formData.instructions}
                                    onChange={e => setFormData({...formData, instructions: e.target.value})}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="submit" className="btn-premium-primary" style={{ flex: 1 }} disabled={loading}>
                                    {loading ? 'Creating...' : 'Launch Assignment'}
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

export default TaskManagerPage;
