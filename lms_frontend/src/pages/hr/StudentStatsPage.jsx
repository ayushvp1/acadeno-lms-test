import React, { useEffect, useState } from 'react';
import { analyticsApi } from '../../api/analyticsApi';
import axiosInstance from '../../api/axiosInstance';
import { 
    Users, 
    TrendingUp, 
    TrendingDown, 
    Search, 
    Filter, 
    ChevronRight,
    Trophy,
    Target,
    Activity,
    User,
    ChevronDown,
    X,
    Calendar,
    BarChart3
} from 'lucide-react';
import '../../styles/epic05.css';

const StudentStatsPage = () => {
    const [students, setStudents] = useState([]);
    const [batches, setBatches] = useState([]);
    const [selectedBatch, setSelectedBatch] = useState('all');
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentStats, setStudentStats] = useState(null);

    useEffect(() => {
        fetchMetadata();
        fetchBatchData('all');
    }, []);

    const fetchMetadata = async () => {
        try {
            const res = await axiosInstance.get('/api/registration/courses');
            const allCourses = res.data.courses || [];
            let allBatches = [];
            for(const course of allCourses) {
                const bRes = await axiosInstance.get(`/api/registration/courses/${course.id}/batches`);
                allBatches = [...allBatches, ...bRes.data.batches.map(b => ({ ...b, course_title: course.name }))];
            }
            setBatches(allBatches);
        } catch (err) {
            console.error('Failed to load filter metadata');
        }
    };

    const fetchBatchData = async (batchId) => {
        setLoading(true);
        try {
            if (batchId === 'all') {
                // Mocking global student list if no batch selected - in real app, might need a global endpoint
                setStudents([
                    { student_id: 's1', student_name: 'Anulal P', total_assigned: 12, completed_count: 8, batch_name: 'Ayurveda Foundation' },
                    { student_id: 's2', student_name: 'Priya Verma', total_assigned: 12, completed_count: 11, batch_name: 'Prakriti Advanced' },
                    { student_id: 's3', student_name: 'Rahul K', total_assigned: 12, completed_count: 4, batch_name: 'Ayurveda Foundation' }
                ]);
            } else {
                const res = await analyticsApi.getBatchAnalytics(batchId);
                const batch = batches.find(b => b.id === batchId);
                setStudents(res.students.map(s => ({ ...s, batch_name: batch?.name })));
            }
        } catch (err) {
            console.error('Failed to load student analytics');
        } finally {
            setLoading(false);
        }
    };

    const handleStudentClick = async (student) => {
        try {
            setLoading(true);
            const res = await analyticsApi.getStudentStats(student.student_id);
            setStudentStats(res);
            setSelectedStudent(student);
        } catch (err) {
            alert('Could not load student trends');
        } finally {
            setLoading(false);
        }
    };

    const filteredStudents = students.filter(s => 
        s.student_name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="epic05-container">
            <header className="premium-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--indigo-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                        <Activity size={18} />
                        <span>Performance Intelligence</span>
                    </div>
                    <h1>Student Capability Index</h1>
                    <p>Monitor learning trajectories and task completion across the platform</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div className="search-box-premium">
                        <Search size={18} />
                        <input 
                            type="text" 
                            placeholder="Search students..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="filter-select-premium">
                        <Filter size={18} />
                        <select 
                            value={selectedBatch} 
                            onChange={e => { setSelectedBatch(e.target.value); fetchBatchData(e.target.value); }}
                        >
                            <option value="all">All Batches</option>
                            {batches.map(b => (
                                <option key={b.id} value={b.id}>[{b.course_title}] {b.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '4rem' }}>
                {filteredStudents.map(student => {
                    const progress = student.total_assigned > 0 ? (student.completed_count / student.total_assigned) * 100 : 0;
                    const isStruggling = progress < 50;

                    return (
                        <div 
                            key={student.student_id} 
                            className="premium-card hover:translate-y-[-4px] transition-all cursor-pointer"
                            onClick={() => handleStudentClick(student)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: isStruggling ? '#fef2f2' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyCenter: 'center', color: isStruggling ? '#ef4444' : '#22c55e' }}>
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <h3 style={{ fontWeight: 800, fontSize: '1.125rem', color: '#1e293b' }}>{student.student_name}</h3>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{student.batch_name}</span>
                                    </div>
                                </div>
                                {isStruggling ? <TrendingDown color="#ef4444" size={20} /> : <TrendingUp color="#22c55e" size={20} />}
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.875rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>Task Completion</span>
                                    <span style={{ fontWeight: 800, color: '#1e293b' }}>{Math.round(progress)}%</span>
                                </div>
                                <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                    <div style={{ width: `${progress}%`, height: '100%', background: isStruggling ? '#ef4444' : 'var(--indigo-primary)', borderRadius: '10px', transition: 'width 0.6s ease' }}></div>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>Tasks Done</div>
                                    <div style={{ fontWeight: 800, color: '#1e293b' }}>{student.completed_count} / {student.total_assigned}</div>
                                </div>
                                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '12px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>Status</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isStruggling ? '#ef4444' : '#22c55e' }}>
                                        {isStruggling ? 'Critical' : 'Excellent'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Student Detail Modal (Drawer Style) */}
            {selectedStudent && (
                <div className="modal-overlay-blur" onClick={() => setSelectedStudent(null)}>
                    <div className="modal-content-premium anim-slide-up" style={{ maxWidth: '800px', width: '90%' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ padding: '12px', background: 'var(--indigo-soft)', color: 'var(--indigo-primary)', borderRadius: '12px' }}>
                                    <User size={28} />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1e293b' }}>{selectedStudent.student_name}</h2>
                                    <p style={{ color: '#64748b' }}>Detailed Performance Analytics</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedStudent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={28} />
                            </button>
                        </div>

                        {studentStats && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {/* Big Stats Row */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                                    <div className="premium-card" style={{ background: '#f0fdf4', border: 'none' }}>
                                        <Trophy size={20} color="#22c55e" style={{ marginBottom: '1rem' }} />
                                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>{studentStats.stats.avg_score || 0}%</div>
                                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Average Score</div>
                                    </div>
                                    <div className="premium-card" style={{ background: '#eff6ff', border: 'none' }}>
                                        <Target size={20} color="#3b82f6" style={{ marginBottom: '1rem' }} />
                                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>{studentStats.stats.completed_tasks} / {studentStats.stats.total_tasks}</div>
                                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Tasks Completed</div>
                                    </div>
                                    <div className="premium-card" style={{ background: '#fff7ed', border: 'none' }}>
                                        <Activity size={20} color="#f97316" style={{ marginBottom: '1rem' }} />
                                        <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e293b' }}>{studentStats.history.length > 5 ? 'High' : 'Moderate'}</div>
                                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Engagement Level</div>
                                    </div>
                                </div>

                                {/* Graph Simulation */}
                                <div className="premium-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                        <h3 style={{ fontWeight: 800, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <BarChart3 size={20} color="var(--indigo-primary)" />
                                            Task Completion Trend
                                        </h3>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Last 10 Assignments</span>
                                    </div>
                                    
                                    <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '12px', paddingBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
                                        {studentStats.history.map((h, i) => (
                                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <div 
                                                    style={{ 
                                                        width: '100%', 
                                                        height: h.is_completed ? `${h.score > 0 ? h.score : 100}%` : '5%', 
                                                        background: h.is_completed ? 'var(--linear-premium)' : '#fee2e2',
                                                        borderRadius: '6px 6px 0 0',
                                                        transition: 'height 1s ease',
                                                        position: 'relative'
                                                    }}
                                                    title={h.title}
                                                >
                                                    {h.is_completed && h.score > 0 && (
                                                        <span style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)', fontSize: '0.65rem', fontWeight: 800 }}>{h.score}</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '8px', textAlign: 'center', whiteSpace: 'nowrap', maxWidth: '50px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {studentStats.history.length === 0 && (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No task history available for this student.</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentStatsPage;
