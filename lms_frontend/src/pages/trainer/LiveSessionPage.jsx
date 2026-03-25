import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';
import { 
    Video, 
    Calendar, 
    Plus, 
    X, 
    Users, 
    ExternalLink, 
    Clock, 
    CheckCircle, 
    ArrowRight,
    Play,
    Trash2
} from 'lucide-react';
import '../../styles/epic05.css';

const LiveSessionPage = () => {
    const { batchId } = useParams();
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showScheduleModal, setShowScheduleModal] = useState(false);

    useEffect(() => {
        fetchSessions();
    }, [batchId]);

    const fetchSessions = async () => {
        try {
            setLoading(true);
            const data = await courseApi.getLiveSessions(batchId);
            setSessions(data.sessions || []);
        } catch (err) {
            console.error('Failed to load sessions');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return (
        <div className="epic05-container flex items-center justify-center h-screen">
            <div className="spinner"></div>
            <span style={{ marginLeft: '1rem', color: '#64748b' }}>Fetching live sessions...</span>
        </div>
    );

    return (
        <div className="epic05-container">
            {/* Header */}
            <header className="premium-header">
                <div>
                    <h1>Live Learning Sessions</h1>
                    <p>Schedule and moderate synchronous classrooms for Batch: {batchId}</p>
                </div>
                <button onClick={() => setShowScheduleModal(true)} className="btn-premium-primary">
                    <Plus size={20} />
                    Schedule New Session
                </button>
            </header>

            {/* Sessions Timeline */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                {sessions.map(session => (
                    <div key={session.id} className="premium-card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ background: 'linear-gradient(to right, #4f46e5, #818cf8)', padding: '1.5rem', color: 'white' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <div style={{ background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, backdropFilter: 'blur(4px)' }}>
                                    LIVE SESSION
                                </div>
                                <div className="badge-premium" style={{ background: 'white', color: 'var(--indigo-primary)', fontSize: '0.7rem' }}>
                                    SCHEDULED
                                </div>
                            </div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>{session.topic}</h3>
                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', opacity: 0.9 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> {session.scheduled_at?.split('T')[0]}</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {session.scheduled_at?.split('T')[1]?.substring(0, 5)}</span>
                            </div>
                        </div>

                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                {session.description || 'Join this interactive session to deep dive into advanced topics and clear your doubts live with the mentor.'}
                            </p>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#475569' }}>
                                    <Users size={18} />
                                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>24 Invited</span>
                                </div>
                                <button className="btn-premium-primary" style={{ padding: '8px 20px', fontSize: '0.875rem' }}>
                                    <Play size={16} />
                                    Start Session
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {sessions.length === 0 && (
                    <div className="full-width">
                        <div className="empty-state-container">
                            <div className="empty-state-icon"><Video size={48} /></div>
                            <h2>No sessions scheduled</h2>
                            <p>Enable real-time interaction by scheduling your first live session for this cohort.</p>
                            <button onClick={() => setShowScheduleModal(true)} className="btn-premium-primary" style={{ marginTop: '1rem' }}>Schedule Now</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Schedule Modal */}
            {showScheduleModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Schedule Live Session</h2>
                            <button onClick={() => setShowScheduleModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>Topic*</label>
                                <input type="text" className="premium-search-input" style={{ paddingLeft: '1rem' }} required placeholder="e.g. Q&A on Digestive Health" />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                <div className="form-group">
                                    <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>Date & Time*</label>
                                    <input type="datetime-local" className="premium-search-input" style={{ paddingLeft: '1rem' }} required />
                                </div>
                                <div className="form-group">
                                    <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>Estimated Duration (Min)</label>
                                    <input type="number" className="premium-search-input" style={{ paddingLeft: '1rem' }} placeholder="60" />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="submit" className="btn-premium-primary" style={{ flex: 1 }}>Confirm Schedule</button>
                                <button type="button" className="btn-secondary" onClick={() => setShowScheduleModal(false)} style={{ flex: 1 }}>Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LiveSessionPage;
