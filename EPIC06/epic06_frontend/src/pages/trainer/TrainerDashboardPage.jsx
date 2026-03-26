import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import hrAdminApi from '../../api/hrAdminApi';
import { 
    Activity, 
    BookOpen, 
    Clock, 
    Users, 
    ChevronRight, 
    CheckCircle, 
    Calendar,
    Layout,
    Megaphone,
    X,
    Pin,
    Trash2,
    Plus,
    Bell,
    Download,
    FileText
} from 'lucide-react';
import announcementApi from '../../api/announcementApi';
import analyticsApi from '../../api/analyticsApi';
import '../../styles/epic8.css';

const TrainerDashboardPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('active'); // 'active' or 'completed'
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Announcement States
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [announcements, setAnnouncements] = useState([]);
    const [showAnnounceModal, setShowAnnounceModal] = useState(false);
    const [showNewForm, setShowNewForm] = useState(false);
    const [announceFormData, setAnnounceFormData] = useState({
        title: '',
        content: '',
        is_pinned: false,
        expires_at: ''
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchBatches();
    }, [activeTab]);

    const fetchBatches = async () => {
        try {
            setLoading(true);
            const res = await hrAdminApi.getTrainerBatches(activeTab);
            setBatches(res.data.batches);
            setError(null);
        } catch (err) {
            setError('Failed to fetch your batches. Please try again later.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'TBA';
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const formatSchedule = (batch) => {
        if (!batch.class_days || !batch.class_time_start) return 'Schedule not set';
        const days = Array.isArray(batch.class_days) ? batch.class_days.join(', ') : 'Custom';
        return `${days} @ ${batch.class_time_start.slice(0, 5)} - ${batch.class_time_end?.slice(0, 5)}`;
    };

    const fetchAnnouncements = async (batchId) => {
        try {
            const res = await announcementApi.getBatchAnnouncements(batchId);
            setAnnouncements(res.announcements);
        } catch (err) {
            console.error('Failed to fetch announcements', err);
        }
    };

    const handleCreateAnnouncement = async (e) => {
        e.preventDefault();
        if (!selectedBatch) return;
        try {
            setSubmitting(true);
            await announcementApi.createAnnouncement({
                ...announceFormData,
                batch_id: selectedBatch.id
            });
            setShowNewForm(false);
            setAnnounceFormData({ title: '', content: '', is_pinned: false, expires_at: '' });
            fetchAnnouncements(selectedBatch.id);
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to post announcement');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteAnnouncement = async (id) => {
        if (!window.confirm('Are you sure you want to delete this announcement?')) return;
        try {
            await announcementApi.deleteAnnouncement(id);
            fetchAnnouncements(selectedBatch.id);
        } catch (err) {
            alert('Failed to delete announcement');
        }
    };

    const handleExport = async (batchId, format, batchName) => {
        try {
            const response = await analyticsApi.exportBatchReport(batchId, format);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Performance_Report_${batchName.replace(/\s+/g, '_')}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (err) {
            console.error('Export failed', err);
            alert('Failed to generate report. Please try again.');
        }
    };

    return (
        <div className="epic8-container">
            {/* Header Area */}
            <header className="premium-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--indigo-primary)', marginBottom: '0.5rem', fontWeight: 600 }}>
                        <Layout size={18} />
                        <span>Faculty Portal</span>
                    </div>
                    <h1>Trainer Command Center</h1>
                    <p>Welcome back, {user?.name || user?.email}. Here are your teaching responsibilities.</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                        className={`tab-button ${activeTab === 'active' ? 'active' : ''}`}
                        onClick={() => setActiveTab('active')}
                    >
                        Active & Upcoming
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'completed' ? 'active' : ''}`}
                        onClick={() => setActiveTab('completed')}
                    >
                        Completed
                    </button>
                </div>
            </header>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
                    <div className="spinner"></div>
                </div>
            ) : error ? (
                <div className="alert alert-error">{error}</div>
            ) : batches.length === 0 ? (
                <div className="empty-state-container" style={{ padding: '80px 20px' }}>
                    <Activity size={48} style={{ opacity: 0.3, marginBottom: '20px' }} />
                    <h2>No {activeTab} batches found</h2>
                    <p>You aren't associated with any {activeTab} batches at this time.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1.5rem' }}>
                    {batches.map(batch => (
                        <div key={batch.id} className="premium-card hover-glow transition-all">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--indigo-primary)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
                                        {batch.batch_code || 'UNTITLED'}
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>{batch.course_name}</h3>
                                </div>
                                <span className={`badge-premium ${batch.status === 'active' ? 'badge-active' : batch.status === 'completed' ? 'badge-completed' : 'badge-draft'}`}>
                                    {batch.status}
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--indigo-soft)', color: 'var(--indigo-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Calendar size={18} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>TIMELINE</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>{formatDate(batch.start_date)} - {formatDate(batch.end_date)}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Users size={18} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>ENROLLMENT</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>{batch.enrolled_count} / {batch.capacity} Students</div>
                                    </div>
                                </div>
                            </div>

                            <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: '12px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Clock size={16} style={{ color: 'var(--indigo-primary)' }} />
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>{formatSchedule(batch)}</span>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                <button 
                                    className="btn-premium-primary" 
                                    style={{ flex: 1 }}
                                    onClick={() => navigate(`/trainer/batch/${batch.id}/dashboard`)}
                                >
                                    Roster & Progress <ChevronRight size={18} />
                                </button>
                                <button 
                                    className="btn-secondary"
                                    onClick={() => {
                                        setSelectedBatch(batch);
                                        setShowAnnounceModal(true);
                                        fetchAnnouncements(batch.id);
                                    }}
                                    title="Manage Announcements"
                                >
                                    <Megaphone size={18} />
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button 
                                    className="btn-secondary"
                                    style={{ flex: 1, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                    onClick={() => handleExport(batch.id, 'csv', batch.course_name)}
                                >
                                    <Download size={14} /> Export CSV
                                </button>
                                <button 
                                    className="btn-secondary"
                                    style={{ flex: 1, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                    onClick={() => handleExport(batch.id, 'pdf', batch.course_name)}
                                >
                                    <FileText size={14} /> Export PDF
                                </button>
                                <button 
                                    className="btn-secondary"
                                    onClick={() => navigate(`/trainer/batch/${batch.id}/live-sessions`)}
                                    title="Launch Live Session"
                                >
                                    Live
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Announcement Management Modal */}
            {showAnnounceModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium" style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', position: 'sticky', top: 0, background: 'white', zIndex: 10, paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '0.25rem' }}>Announcements</h2>
                                <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>Batch: {selectedBatch?.name}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                {!showNewForm && (
                                    <button className="btn-premium-primary" style={{ padding: '8px 16px' }} onClick={() => setShowNewForm(true)}>
                                        <Plus size={18} style={{ marginRight: '8px' }} /> New Update
                                    </button>
                                )}
                                <button onClick={() => { setShowAnnounceModal(false); setShowNewForm(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                    <X size={24} />
                                </button>
                            </div>
                        </div>

                        {showNewForm ? (
                            <form onSubmit={handleCreateAnnouncement} className="premium-form-container" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '16px', marginBottom: '2rem' }}>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label className="premium-label">Title*</label>
                                    <input 
                                        type="text" 
                                        className="premium-form-input" 
                                        required 
                                        placeholder="e.g., Schedule Update for Tomorrow"
                                        value={announceFormData.title}
                                        onChange={e => setAnnounceFormData({...announceFormData, title: e.target.value})}
                                    />
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label className="premium-label">Body Content*</label>
                                    <textarea 
                                        className="premium-form-input" 
                                        rows={4} 
                                        required 
                                        placeholder="Enter the announcement details..."
                                        value={announceFormData.content}
                                        onChange={e => setAnnounceFormData({...announceFormData, content: e.target.value})}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div>
                                        <label className="premium-label">Expiry Date (Optional)</label>
                                        <input 
                                            type="datetime-local" 
                                            className="premium-form-input"
                                            value={announceFormData.expires_at}
                                            onChange={e => setAnnounceFormData({...announceFormData, expires_at: e.target.value})}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '30px' }}>
                                        <input 
                                            type="checkbox" 
                                            id="is_pinned"
                                            checked={announceFormData.is_pinned}
                                            onChange={e => setAnnounceFormData({...announceFormData, is_pinned: e.target.checked})}
                                        />
                                        <label htmlFor="is_pinned" style={{ fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>Pin to top</label>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="submit" className="btn-premium-primary" style={{ flex: 1 }} disabled={submitting}>
                                        {submitting ? 'Publishing...' : 'Publish Announcement'}
                                    </button>
                                    <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewForm(false)}>Cancel</button>
                                </div>
                            </form>
                        ) : (
                            <div className="announcements-list">
                                {announcements.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                        <Bell size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                        <p>No announcements posted yet for this batch.</p>
                                    </div>
                                ) : (
                                    announcements.map(ann => (
                                        <div key={ann.id} style={{ padding: '1.5rem', border: '1px solid #f1f5f9', borderRadius: '16px', marginBottom: '1rem', position: 'relative', background: ann.is_pinned ? '#fdf8f6' : 'white', borderColor: ann.is_pinned ? '#ffedd5' : '#f1f5f9' }}>
                                            {ann.is_pinned && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                                    <Pin size={12} fill="#f59e0b" /> Pinned Announcement
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <h4 style={{ margin: 0, fontWeight: 800, fontSize: '1rem' }}>{ann.title}</h4>
                                                <button onClick={() => handleDeleteAnnouncement(ann.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }} title="Delete">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                            <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, marginBottom: '1rem' }}>{ann.content}</p>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8' }}>
                                                <span>Posted on {new Date(ann.created_at).toLocaleString()}</span>
                                                {ann.expires_at && (
                                                    <span style={{ color: new Date(ann.expires_at) < new Date() ? '#ef4444' : '#64748b' }}>
                                                        {new Date(ann.expires_at) < new Date() ? 'Expired' : `Expires: ${new Date(ann.expires_at).toLocaleString()}`}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
                .tab-button {
                    background: white;
                    border: 1px solid #e2e8f0;
                    padding: 0.75rem 1.5rem;
                    border-radius: 12px;
                    font-weight: 700;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .tab-button.active {
                    background: var(--indigo-primary);
                    color: white;
                    border-color: var(--indigo-primary);
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
                }
                .hover-glow:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 24px rgba(0,0,0,0.05);
                }
            `}} />
        </div>
    );
};

export default TrainerDashboardPage;
