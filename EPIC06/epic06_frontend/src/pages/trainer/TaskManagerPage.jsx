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
    Target,
    BarChart2,
    PieChart,
    ArrowRight,
    History,
    CheckCircle2,
    PlayCircle,
    FileUp,
    RotateCcw,
    Filter
} from 'lucide-react';
import '../../styles/epic05.css';
import { analyticsApi } from '../../api/analyticsApi';

const TaskManagerPage = () => {
    const { user } = useAuth();
    const [tasks, setTasks] = useState([]);
    const [submissions, setSubmissions] = useState([]);
    const [batches, setBatches] = useState([]);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [selectedTaskId, setSelectedTaskId] = useState('');
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
        instructions: '',
        task_type: 'assignment'
    });
    const [showQuizModal, setShowQuizModal] = useState(false);
    const [quizQuestions, setQuizQuestions] = useState([]);
    const [newQuestion, setNewQuestion] = useState({
        question_text: '',
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        correct_option: 'A',
        points: 1
    });
    const [showReopenModal, setShowReopenModal] = useState(false);
    const [reopenReason, setReopenReason] = useState('');
    const [activeSubmission, setActiveSubmission] = useState(null);
    const [assignmentType, setAssignmentType] = useState('batch'); // batch or individual
    const [batchStudents, setBatchStudents] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [showAnalytics, setShowAnalytics] = useState(false);

    // Timeline States
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [timelineData, setTimelineData] = useState(null);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);

    useEffect(() => {
        fetchData();
        if (batches.length === 0) {
            fetchBatches();
        }
    }, [view, showCreateModal, selectedBatchId, selectedTaskId]);

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

    const handleViewTimeline = async (studentId, studentName) => {
        try {
            setTimelineLoading(true);
            setSelectedStudent({ id: studentId, name: studentName });
            setShowTimelineModal(true);
            const res = await analyticsApi.getStudentTimeline(studentId);
            setTimelineData(res);
        } catch (err) {
            console.error('Failed to fetch timeline', err);
            alert('Failed to load student timeline.');
            setShowTimelineModal(false);
        } finally {
            setTimelineLoading(false);
        }
    };

    const fetchData = async () => {
        if (!selectedBatchId && view === 'tasks') {
            setTasks([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            if (view === 'tasks') {
                const data = await taskApi.getTasks(selectedBatchId);
                setTasks(data.tasks || []);
            } else {
                if (selectedTaskId) {
                    const data = await taskApi.getSubmissions(selectedTaskId);
                    setSubmissions(data.submissions || []);
                    fetchAnalytics(selectedTaskId);
                } else {
                    setSubmissions([]);
                    setAnalytics(null);
                }
            }
        } catch (err) {
            console.error('Failed to load task data');
        } finally {
            setLoading(false);
        }
    };

    const fetchAnalytics = async (taskId) => {
        try {
            const data = await taskApi.getTaskAnalytics(taskId);
            setAnalytics(data);
        } catch (err) {
            console.error('Failed to load analytics');
        }
    };

    const fetchBatches = async () => {
        try {
            const res = await axiosInstance.get('/api/batches/my-batches');
            const myBatches = res.data.batches || [];
            // Map course identifiers if missing (the endpoint should provide them)
            setBatches(myBatches.map(b => ({
                ...b,
                course_title: b.course_name || b.course_title || 'Unknown Course',
                course_id: b.course_id
            })));
        } catch (err) {
            console.error('Failed to load batches', err);
        }
    };

    const handleManageQuiz = async (taskId) => {
        setSelectedTaskId(taskId);
        try {
            const data = await taskApi.getQuizQuestions(taskId);
            setQuizQuestions(data.questions || []);
            setShowQuizModal(true);
        } catch (err) {
            alert('Failed to load quiz questions');
        }
    };

    const handleAddQuestion = async (e) => {
        e.preventDefault();
        try {
            const data = await taskApi.addQuizQuestion(selectedTaskId, newQuestion);
            setQuizQuestions([...quizQuestions, data.question]);
            setNewQuestion({ question_text: '', option_a: '', option_b: '', option_c: '', option_d: '', correct_option: 'A', points: 1 });
        } catch (err) {
            alert('Failed to add question');
        }
    };

    const handleDeleteQuestion = async (qId) => {
        try {
            await taskApi.deleteQuizQuestion(selectedTaskId, qId);
            setQuizQuestions(quizQuestions.filter(q => q.id !== qId));
        } catch (err) {
            alert('Failed to delete question');
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

    const handleReopen = async () => {
        if (!reopenReason.trim() || !activeSubmission) return;
        try {
            setLoading(true);
            await taskApi.reopenSubmission(selectedTaskId, activeSubmission.id, reopenReason);
            setShowReopenModal(false);
            setReopenReason('');
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to reopen task');
        } finally {
            setLoading(false);
        }
    };

    if (loading && tasks.length === 0 && !showCreateModal && !showReopenModal) return (
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
            
            {/* Filters */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Filter by Batch</label>
                    <div className="filter-select-premium" style={{ minWidth: 'auto' }}>
                        <Filter size={18} />
                        <select 
                            value={selectedBatchId}
                            onChange={(e) => {
                                setSelectedBatchId(e.target.value);
                                setSelectedTaskId(''); // reset task when batch changes
                            }}
                        >
                            <option value="">All Batches</option>
                            {batches.map(b => (
                                <option key={b.id} value={b.id}>[{b.course_title}] {b.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {view === 'submissions' && (
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Filter by Task</label>
                        <div className="filter-select-premium" style={{ minWidth: 'auto' }}>
                            <ClipboardList size={18} />
                            <select 
                                value={selectedTaskId}
                                onChange={(e) => setSelectedTaskId(e.target.value)}
                            >
                                <option value="">Select a task to view submissions</option>
                                {/* We filter tasks by batch if batch selected, or show all if trainer has many */}
                                {tasks.map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
                {view === 'submissions' && selectedTaskId && (
                    <div style={{ alignSelf: 'flex-end', paddingBottom: '8px' }}>
                         <button 
                            onClick={() => setShowAnalytics(!showAnalytics)}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: showAnalytics ? 'var(--indigo-soft)' : 'white' }}
                        >
                            <BarChart2 size={18} />
                            {showAnalytics ? 'Hide Analytics' : 'View Analytics'}
                        </button>
                    </div>
                )}
            </div>

            {/* Analytics Dashboard */}
            {view === 'submissions' && selectedTaskId && showAnalytics && analytics && (
                <div className="analytics-section anim-fade-in" style={{ marginBottom: '2.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="premium-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Submission Rate</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--indigo-primary)' }}>{analytics.stats.submission_rate}%</div>
                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>{analytics.stats.submitted_count} / {analytics.stats.total_students} Students</div>
                        </div>
                        <div className="premium-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Avg. Score</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#16a34a' }}>{analytics.stats.average_score}</div>
                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>Out of {analytics.task.max_score}</div>
                        </div>
                        <div className="premium-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Pending</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#ea580c' }}>{analytics.stats.pending_count}</div>
                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>Awaiting Submission</div>
                        </div>
                        <div className="premium-card" style={{ padding: '1.25rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>Evaluated</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#0284c7' }}>{analytics.stats.evaluated_count}</div>
                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>/{analytics.stats.submitted_count} Received</div>
                        </div>
                    </div>

                    <div className="premium-card" style={{ padding: '1.5rem' }}>
                        <h4 style={{ fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <PieChart size={18} /> Score Distribution
                        </h4>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', height: '150px', padding: '0 1rem' }}>
                            {Object.entries(analytics.stats.score_distribution).map(([bucket, count]) => {
                                const height = analytics.stats.evaluated_count > 0 ? (count / analytics.stats.evaluated_count) * 100 : 0;
                                return (
                                    <div key={bucket} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '100%', background: '#f1f5f9', borderRadius: '4px', height: '100%', position: 'relative', overflow: 'hidden' }}>
                                            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${height}%`, background: 'var(--indigo-primary)', borderRadius: '4px', transition: 'height 0.5s ease' }}></div>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>{bucket} ({count})</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

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
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="btn-secondary" style={{ flex: 1 }}>Edit Task</button>
                                {task.task_type === 'quiz' && (
                                    <button 
                                        onClick={() => handleManageQuiz(task.id)}
                                        className="btn-premium-primary" 
                                        style={{ flex: 1, fontSize: '0.8125rem' }}
                                    >
                                        Questions
                                    </button>
                                )}
                            </div>
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
                            {(analytics?.roster || submissions).map(sub => {
                                // If we are using analytics roster, we need to map to the structure the table expects
                                const isRosterItem = !!sub.user_id;
                                const studentName = sub.name || sub.student_name;
                                const status = sub.status;
                                const score = sub.score;
                                const isOverdue = sub.is_overdue;

                                return (
                                    <tr key={sub.id || sub.user_id} style={{ borderBottom: '1px solid #f1f5f9', background: isOverdue ? '#fff1f2' : 'transparent' }}>
                                        <td style={{ padding: '1.5rem', fontWeight: 700, color: isOverdue ? '#e11d48' : '#1e293b' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {studentName}
                                                {isOverdue && <span style={{ fontSize: '0.625rem', background: '#e11d48', color: 'white', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>Overdue</span>}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.5rem', color: '#475569' }}>{analytics?.task.title || sub.task_title}</td>
                                        <td style={{ padding: '1.5rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                                            {sub.submitted_at || (isOverdue ? 'Missing' : 'Pending')}
                                        </td>
                                        <td style={{ padding: '1.5rem' }}>
                                            <span className={`badge-premium ${status === 'evaluated' ? 'badge-active' : ''}`} style={{ 
                                                background: status === 'pending' ? (isOverdue ? '#fee2e2' : '#fff7ed') : '#dcfce7', 
                                                color: status === 'pending' ? (isOverdue ? '#e11d48' : '#ea580c') : '#16a34a' 
                                            }}>
                                                {status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.5rem', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button 
                                                onClick={() => handleViewTimeline(sub.student_id || sub.user_id, studentName)}
                                                className="btn-secondary" 
                                                style={{ padding: '6px', minWidth: 'auto' }}
                                                title="View Learning Timeline"
                                            >
                                                <History size={16} />
                                            </button>
                                            {sub.submission_id ? (
                                                <>
                                                    <button 
                                                        className="btn-secondary" 
                                                        style={{ padding: '8px 16px', fontSize: '0.8125rem' }}
                                                        onClick={() => {
                                                            // Logic to select this submission in the 'submissions' view if needed
                                                            // For now we just review
                                                        }}
                                                    >
                                                        {status === 'pending' ? 'Grade' : 'Review'}
                                                    </button>
                                                    {(status === 'submitted' || status === 'evaluated') && (
                                                        <button 
                                                            className="btn-secondary" 
                                                            style={{ padding: '8px 16px', fontSize: '0.8125rem', color: '#dc2626', borderColor: '#fee2e2' }}
                                                            onClick={() => {
                                                                setActiveSubmission({ ...sub, id: sub.submission_id, student_name: studentName });
                                                                setShowReopenModal(true);
                                                            }}
                                                        >
                                                            Reopen
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>No submission</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
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
                                <label>Task Type*</label>
                                <select 
                                    className="premium-form-input"
                                    required
                                    value={formData.task_type}
                                    onChange={e => setFormData({...formData, task_type: e.target.value})}
                                >
                                    <option value="assignment">Assignment (File Upload)</option>
                                    <option value="quiz">Quiz (Multiple Choice)</option>
                                    <option value="project">Project (Complex)</option>
                                </select>
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

            {/* Reopen Modal */}
            {showReopenModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium" style={{ maxWidth: '500px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>Reopen for {activeSubmission?.student_name}</h2>
                            <button onClick={() => setShowReopenModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1rem' }}>
                                Reopening will clear the student's current score and allow them to upload new files or edit their response.
                            </p>
                            <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Reason for reopening*</label>
                            <textarea 
                                className="premium-form-input"
                                value={reopenReason}
                                onChange={(e) => setReopenReason(e.target.value)}
                                placeholder="Explain what the student needs to improve..."
                                style={{ minHeight: '120px' }}
                                required
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button 
                                className="btn-premium-primary" 
                                style={{ flex: 1, background: '#dc2626' }}
                                onClick={handleReopen}
                                disabled={!reopenReason.trim() || loading}
                            >
                                {loading ? 'Processing...' : 'Confirm Reopen'}
                            </button>
                            <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowReopenModal(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Quiz Management Modal */}
            {showQuizModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium" style={{ maxWidth: '800px', width: '90%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Manage Quiz Questions</h2>
                                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Add or remove multiple choice questions</p>
                            </div>
                            <button onClick={() => setShowQuizModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
                            {/* Questions List */}
                            <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '1rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.5rem', color: '#1e293b' }}>Existing Questions ({quizQuestions.length})</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {quizQuestions.map((q, idx) => (
                                        <div key={idx} className="premium-card" style={{ padding: '1.25rem', background: '#f8fafc' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                                <span style={{ fontWeight: 800, color: 'var(--indigo-primary)' }}>Q{idx + 1}. ({q.points} Pts)</span>
                                                <button onClick={() => handleDeleteQuestion(q.id)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                    <X size={16} />
                                                </button>
                                            </div>
                                            <p style={{ fontWeight: 600, marginBottom: '1rem' }}>{q.question_text}</p>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8125rem' }}>
                                                <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: q.correct_option === 'A' ? '#dcfce7' : 'white' }}>A: {q.option_a}</div>
                                                <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: q.correct_option === 'B' ? '#dcfce7' : 'white' }}>B: {q.option_b}</div>
                                                <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: q.correct_option === 'C' ? '#dcfce7' : 'white' }}>C: {q.option_c}</div>
                                                <div style={{ padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', background: q.correct_option === 'D' ? '#dcfce7' : 'white' }}>D: {q.option_d}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {quizQuestions.length === 0 && (
                                        <p style={{ textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', padding: '2rem' }}>No questions added yet.</p>
                                    )}
                                </div>
                            </div>

                            {/* Add Question Form */}
                            <div style={{ background: '#f1f5f9', padding: '1.5rem', borderRadius: '16px', position: 'sticky', top: 0, height: 'fit-content' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.25rem' }}>Add New Question</h3>
                                <form onSubmit={handleAddQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label style={{ fontSize: '0.75rem' }}>Question Text</label>
                                        <textarea 
                                            className="premium-form-input" 
                                            required 
                                            value={newQuestion.question_text}
                                            onChange={e => setNewQuestion({...newQuestion, question_text: e.target.value})}
                                            style={{ minHeight: '80px' }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem' }}>Option A</label>
                                            <input type="text" className="premium-form-input" required value={newQuestion.option_a} onChange={e => setNewQuestion({...newQuestion, option_a: e.target.value})} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem' }}>Option B</label>
                                            <input type="text" className="premium-form-input" required value={newQuestion.option_b} onChange={e => setNewQuestion({...newQuestion, option_b: e.target.value})} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem' }}>Option C</label>
                                            <input type="text" className="premium-form-input" required value={newQuestion.option_c} onChange={e => setNewQuestion({...newQuestion, option_c: e.target.value})} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem' }}>Option D</label>
                                            <input type="text" className="premium-form-input" required value={newQuestion.option_d} onChange={e => setNewQuestion({...newQuestion, option_d: e.target.value})} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div>
                                            <label style={{ fontSize: '0.75rem' }}>Correct Option</label>
                                            <select className="premium-form-input" value={newQuestion.correct_option} onChange={e => setNewQuestion({...newQuestion, correct_option: e.target.value})}>
                                                <option value="A">A</option>
                                                <option value="B">B</option>
                                                <option value="C">C</option>
                                                <option value="D">D</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.75rem' }}>Points</label>
                                            <input type="number" className="premium-form-input" value={newQuestion.points} onChange={e => setNewQuestion({...newQuestion, points: parseInt(e.target.value)})} />
                                        </div>
                                    </div>
                                    <button type="submit" className="btn-premium-primary" style={{ marginTop: '0.5rem' }}>Add to Quiz</button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Student Timeline Modal */}
            {showTimelineModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium" style={{ maxWidth: '600px', width: '90%', maxHeight: '85vh', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
                            <div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 900 }}>Student Learning Timeline</h2>
                                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>{selectedStudent?.name} - {timelineData?.student?.registration_number || 'REG-ID'}</p>
                            </div>
                            <button onClick={() => { setShowTimelineModal(false); setTimelineData(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                            {timelineLoading ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                                    <div className="spinner"></div>
                                </div>
                            ) : !timelineData?.timeline?.length ? (
                                <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                                    <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '50%', width: 'fit-content', margin: '0 auto 1.5rem' }}>
                                        <History size={48} style={{ opacity: 0.2 }} />
                                    </div>
                                    <h3 style={{ fontWeight: 800, color: '#1e293b' }}>No activity yet</h3>
                                    <p style={{ color: '#64748b' }}>This student hasn't accessed any content or submitted tasks.</p>
                                </div>
                            ) : (
                                <div className="timeline-feed" style={{ padding: '0 1rem' }}>
                                    {timelineData.timeline.map((event, idx) => {
                                        const isLast = idx === timelineData.timeline.length - 1;
                                        let Icon = History;
                                        let iconBg = '#f1f5f9';
                                        let iconColor = '#64748b';

                                        if (event.type === 'content_access') {
                                            Icon = PlayCircle;
                                            iconBg = '#ecfdf5';
                                            iconColor = '#059669';
                                        } else if (event.type === 'content_completion') {
                                            Icon = CheckCircle2;
                                            iconBg = '#dcfce7';
                                            iconColor = '#16a34a';
                                        } else if (event.type === 'task_submission') {
                                            Icon = FileUp;
                                            iconBg = '#eff6ff';
                                            iconColor = '#2563eb';
                                        } else if (event.type === 'task_evaluation') {
                                            Icon = Trophy;
                                            iconBg = '#fff7ed';
                                            iconColor = '#ea580c';
                                        }

                                        return (
                                            <div key={idx} style={{ display: 'flex', gap: '1.5rem', position: 'relative', marginBottom: isLast ? 0 : '2rem' }}>
                                                {!isLast && (
                                                    <div style={{ position: 'absolute', left: '17px', top: '34px', bottom: '-28px', width: '2px', background: '#e2e8f0', zIndex: 0 }}></div>
                                                )}
                                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, border: '4px solid white', boxShadow: '0 0 0 1px #f1f5f9' }}>
                                                    <Icon size={18} />
                                                </div>
                                                <div style={{ paddingBottom: '0.5rem' }}>
                                                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontWeight: 600, marginBottom: '2px' }}>
                                                        {new Date(event.event_date).toLocaleString('en-US', { 
                                                            month: 'short', 
                                                            day: 'numeric', 
                                                            hour: '2-digit', 
                                                            minute: '2-digit' 
                                                        })}
                                                    </div>
                                                    <h4 style={{ fontSize: '0.925rem', fontWeight: 800, margin: '0 0 4px 0', color: '#1e293b' }}>{event.title}</h4>
                                                    <div style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: '#f1f5f9', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>{event.type.replace('_', ' ')}</span>
                                                        <span>•</span>
                                                        <span style={{ fontWeight: 600, color: event.type === 'task_evaluation' ? '#16a34a' : '#64748b' }}>{event.action}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', flexShrink: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>Total Activities Recorded</span>
                                <span style={{ padding: '4px 12px', background: 'var(--indigo-primary)', color: 'white', borderRadius: '20px', fontSize: '0.875rem', fontWeight: 800 }}>{timelineData?.timeline?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TaskManagerPage;
