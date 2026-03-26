import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { courseApi } from '../../api/courseApi';
import { 
    Plus, 
    Upload, 
    Video, 
    FileText, 
    Link as LinkIcon, 
    X, 
    CheckCircle, 
    Clock, 
    MoreVertical, 
    Play, 
    ArrowLeft,
    Trash2
} from 'lucide-react';
import '../../styles/epic05.css';

const ContentUploaderPage = () => {
    const { courseId, moduleId, subModuleId } = useParams();
    const navigate = useNavigate();
    const [content, setContent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploadType, setUploadType] = useState('document'); // Default to document for PDFs
    const [file, setFile] = useState(null);
    const [title, setTitle] = useState('');

    useEffect(() => {
        fetchContent();
    }, [subModuleId]);

    const fetchContent = async () => {
        try {
            setLoading(true);
            const data = await courseApi.getSubModuleContent(courseId, moduleId, subModuleId);
            setContent(data.content || []);
        } catch (err) {
            console.error('Failed to load sub-module content');
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file && uploadType !== 'link') {
            alert('Please select a file to upload');
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('title', title);
            formData.append('content_type', uploadType === 'document' ? 'pdf' : uploadType);
            if (file) formData.append('file', file);
            
            await courseApi.uploadContent(courseId, moduleId, subModuleId, formData);
            
            setUploading(false);
            setShowUploadModal(false);
            setFile(null);
            setTitle('');
            fetchContent();
        } catch (err) {
            alert(err.response?.data?.error || 'Upload failed');
            setUploading(false);
        }
    };

    if (loading) return (
        <div className="epic05-container flex items-center justify-center h-screen">
            <div className="spinner"></div>
            <span style={{ marginLeft: '1rem', color: '#64748b' }}>Loading content...</span>
        </div>
    );

    return (
        <div className="epic05-container">
            {/* Header */}
            <header className="premium-header">
                <div>
                    <button 
                        onClick={() => navigate(-1)} 
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--indigo-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, marginBottom: '0.5rem' }}
                    >
                        <ArrowLeft size={16} />
                        Back to Builder
                    </button>
                    <h1>Content Manager</h1>
                    <p>Sub-module ID: {subModuleId}</p>
                </div>
                <button onClick={() => setShowUploadModal(true)} className="btn-premium-primary">
                    <Upload size={20} />
                    Upload Content
                </button>
            </header>

            {/* List Content */}
            <div className="premium-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <h2 style={{ fontWeight: 800 }}>Materials & Resources</h2>
                    <div className="badge-premium" style={{ background: '#f1f5f9', color: '#475569' }}>
                        {content.length} Items Listed
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {content.map((item, idx) => (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1rem', border: '1px solid #f1f5f9', borderRadius: '1rem', background: '#f8fafc', transition: 'all 0.2s' }} className="hover:border-indigo-200">
                            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: item.type === 'video' ? '#eef2ff' : '#ecfdf5', color: item.type === 'video' ? '#4f46e5' : '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {item.type === 'video' ? <Video size={24} /> : <FileText size={24} />}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>{item.title}</div>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '4px' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} /> {item.duration || 'N/A'}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>{item.type}</span>
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {item.transcoding_status === 'completed' ? (
                                    <div className="badge-premium badge-active" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <CheckCircle size={12} /> Ready
                                    </div>
                                ) : (
                                    <div className="badge-premium" style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} /> {item.transcoding_status}
                                    </div>
                                )}
                                <button className="btn-secondary" style={{ padding: '8px' }}>
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {content.length === 0 && (
                        <div className="empty-state-container">
                            <div className="empty-state-icon">
                                <Video size={48} />
                            </div>
                            <h2>No content found</h2>
                            <p>Upload videos, PDFs, or external links to build this lesson's resources.</p>
                            <button onClick={() => setShowUploadModal(true)} className="btn-premium-primary" style={{ marginTop: '1.5rem' }}>
                                <Plus size={20} />
                                Add Content
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="modal-overlay-blur">
                    <div className="modal-content-premium">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Upload New Content</h2>
                            <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                            <button 
                                onClick={() => setUploadType('video')}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer', background: uploadType === 'video' ? 'white' : 'transparent', color: uploadType === 'video' ? 'var(--indigo-primary)' : '#64748b', boxShadow: uploadType === 'video' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
                            > Video </button>
                            <button 
                                onClick={() => setUploadType('document')}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 600, cursor: 'pointer', background: uploadType === 'document' ? 'white' : 'transparent', color: uploadType === 'document' ? 'var(--indigo-primary)' : '#64748b', boxShadow: uploadType === 'document' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
                            > Document </button>
                        </div>

                        <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label>Content Title*</label>
                                <input 
                                    type="text" 
                                    className="premium-form-input" 
                                    required 
                                    placeholder="e.g. Introduction to Prakriti"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>

                            <div 
                                onClick={() => document.getElementById('file-upload').click()}
                                style={{ border: '2px dashed #cbd5e1', borderRadius: '1rem', padding: '3rem 1rem', textAlign: 'center', background: file ? 'var(--emerald-soft)' : '#f8fafc', cursor: 'pointer' }}
                            >
                                <input 
                                    id="file-upload"
                                    type="file" 
                                    hidden 
                                    onChange={(e) => setFile(e.target.files[0])}
                                    accept={uploadType === 'video' ? 'video/mp4' : '.pdf,.doc,.docx,.ppt,.pptx'}
                                />
                                <div className="empty-state-icon" style={{ display: 'inline-flex', marginBottom: '1rem', color: file ? 'var(--emerald-primary)' : 'var(--indigo-primary)' }}>
                                    {file ? <CheckCircle size={32} /> : <Plus size={32} />}
                                </div>
                                <h3 style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>
                                    {file ? file.name : 'Click to select a file'}
                                </h3>
                                <p style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                    {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : `Maximum size: ${uploadType === 'video' ? '2GB' : '50MB'}`}
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="submit" className="btn-premium-primary" style={{ flex: 1 }} disabled={uploading || !file}>
                                    {uploading ? 'Uploading...' : 'Start Upload'}
                                </button>
                                <button type="button" className="btn-secondary" onClick={() => setShowUploadModal(false)} style={{ flex: 1 }}>
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

export default ContentUploaderPage;
