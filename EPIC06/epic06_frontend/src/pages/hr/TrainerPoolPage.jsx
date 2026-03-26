import React, { useState, useEffect } from 'react';
import { hrAdminApi } from '../../api/hrAdminApi';
import { Users, Plus, Trash2, Search, BookOpen, AlertCircle } from 'lucide-react';
import '../../styles/epic8.css';

const TrainerPoolPage = () => {
    const [courses, setCourses] = useState([
        { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Full Stack Web Development' },
        { id: '123e4567-e89b-12d3-a456-426614174001', name: 'UI/UX Product Design' }
    ]);
    const [selectedCourse, setSelectedCourse] = useState(courses[0].id);
    const [trainers, setTrainers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newTrainerId, setNewTrainerId] = useState('');

    useEffect(() => {
        if (selectedCourse) fetchPool();
    }, [selectedCourse]);

    const fetchPool = async () => {
        try {
            setLoading(true);
            const data = await hrAdminApi.listTrainerPool(selectedCourse);
            setTrainers(data.trainers || []);
        } catch (err) {
            console.error('Failed to load pool');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        try {
            await hrAdminApi.addToPool({ course_id: selectedCourse, trainer_id: newTrainerId });
            setNewTrainerId('');
            fetchPool();
        } catch (err) {
            alert('Could not add trainer');
        }
    };

    const handleRemove = async (trainerId) => {
        if (!window.confirm('Are you sure? This trainer will no longer be assignable for new batches of this course.')) return;
        try {
            await hrAdminApi.removeFromPool(selectedCourse, trainerId);
            fetchPool();
        } catch (err) {
            alert('Failed to remove trainer');
        }
    };

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div>
                    <h1>Trainer Pool Management</h1>
                    <p>Approve and manage qualified faculty for each academic program</p>
                </div>
            </div>

            <div className="analytics-layout">
                {/* Course Selector */}
                <div className="premium-card" style={{ padding: '24px' }}>
                    <h2 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>Select Program</h2>
                    <div className="course-list">
                        {courses.map(c => (
                            <button 
                                key={c.id} 
                                className={`course-item-btn ${selectedCourse === c.id ? 'active' : ''}`}
                                onClick={() => setSelectedCourse(c.id)}
                            >
                                <BookOpen size={18} />
                                {c.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Pool Management */}
                <div className="premium-card" style={{ flex: 2 }}>
                    <div className="search-filter-bar">
                        <h2 style={{ fontSize: '1.25rem' }}>Approved Faculty for {courses.find(c => c.id === selectedCourse)?.name}</h2>
                    </div>

                    <div style={{ padding: '24px', borderBottom: '1px solid var(--gray-border)' }}>
                        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <input 
                                    type="text" 
                                    placeholder="Enter Trainer Name or ID..." 
                                    value={newTrainerId}
                                    onChange={(e) => setNewTrainerId(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--gray-border)' }}
                                />
                            </div>
                            <button type="submit" className="btn-premium-primary">
                                <Plus size={18} /> Add to Pool
                            </button>
                        </form>
                    </div>

                    <div className="table-wrapper">
                        {loading ? (
                            <div style={{ padding: '40px', textAlign: 'center' }}><div className="spinner-small" /></div>
                        ) : (
                            <table className="epic8-table">
                                <thead>
                                    <tr>
                                        <th>Faculty Member</th>
                                        <th>Current Load</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {trainers.map(t => (
                                        <tr key={t.id}>
                                            <td>
                                                <div className="table-primary-text">{t.name}</div>
                                                <div className="table-secondary-text">{t.email}</div>
                                            </td>
                                            <td>
                                                <span className={`status-badge ${t.active_batch_count > 2 ? 'status-cancelled' : 'status-active'}`}>
                                                    {t.active_batch_count} Active Batches
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button className="icon-btn" onClick={() => handleRemove(t.id)}>
                                                    <Trash2 size={18} color="var(--error)" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {trainers.length === 0 && (
                                        <tr>
                                            <td colSpan="3" style={{ textAlign: 'center', padding: '40px' }}>
                                                <AlertCircle size={32} color="var(--gray-text)" style={{ marginBottom: '1rem' }} />
                                                <p>No trainers approved for this course pool yet.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .course-item-btn {
                    width: 100%; text-align: left; padding: 14px 16px; border: 1px solid transparent; background: none; border-radius: 8px;
                    display: flex; align-items: center; gap: 12px; cursor: pointer; color: var(--gray-text); font-weight: 600; margin-bottom: 8px; transition: all 0.2s;
                }
                .course-item-btn:hover { background: var(--gray-light); color: var(--primary-blue); }
                .course-item-btn.active { background: #eff6ff; color: var(--primary-blue); border-color: rgba(37, 99, 235, 0.2); }
            `}</style>
        </div>
    );
};

export default TrainerPoolPage;
