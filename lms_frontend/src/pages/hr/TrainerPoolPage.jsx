import React, { useState, useEffect } from 'react';
import { hrAdminApi } from '../../api/hrAdminApi';
import { registrationApi } from '../../api/registrationApi';
import { Plus, Trash2, BookOpen, AlertCircle, UserCheck } from 'lucide-react';
import '../../styles/epic8.css';

const TrainerPoolPage = () => {
    const [courses, setCourses] = useState([]);
    const [allTrainers, setAllTrainers] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [trainers, setTrainers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [newTrainerId, setNewTrainerId] = useState('');

    useEffect(() => {
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (selectedCourse) fetchPool();
    }, [selectedCourse]);

    const fetchInitialData = async () => {
        try {
            const [courseData, trainerData] = await Promise.all([
                registrationApi.listCourses(),
                hrAdminApi.listTrainers()
            ]);
            setCourses(courseData.courses || []);
            setAllTrainers(trainerData.trainers || []);
            if (courseData.courses?.length > 0) {
                setSelectedCourse(courseData.courses[0].id);
            }
        } catch (err) {
            console.error('Failed to load initial data');
        }
    };

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
        if (!newTrainerId) return;
        try {
            await hrAdminApi.addToPool({ course_id: selectedCourse, trainer_id: newTrainerId });
            setNewTrainerId('');
            fetchPool();
        } catch (err) {
            alert('Could not add trainer. Ensure the user exists and has the trainer role.');
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

                    <div style={{ padding: '24px', borderBottom: '1px solid var(--gray-border)', background: 'var(--gray-light)' }}>
                        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <UserCheck size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-text)' }} />
                                <select 
                                    value={newTrainerId}
                                    onChange={(e) => setNewTrainerId(e.target.value)}
                                    required
                                    style={{ 
                                        width: '100%', 
                                        padding: '12px 12px 12px 40px', 
                                        borderRadius: '8px', 
                                        border: '1px solid var(--gray-border)',
                                        background: 'var(--white)',
                                        fontSize: '0.95rem'
                                    }}
                                >
                                    <option value="">Select a Faculty Member to Add...</option>
                                    {allTrainers
                                        .filter(t => !trainers.some(pt => pt.id === t.id))
                                        .map(t => (
                                            <option key={t.id} value={t.id}>
                                                {t.full_name} ({t.email})
                                            </option>
                                        ))
                                    }
                                </select>
                            </div>
                            <button type="submit" className="btn-premium-primary" disabled={!newTrainerId} style={{ height: '46px' }}>
                                <Plus size={18} /> Add to Pool
                            </button>
                        </form>
                        {allTrainers.length === 0 && (
                            <p style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: '8px' }}>
                                Note: No users with "Trainer" role were found in the system.
                            </p>
                        )}
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
                                                <div className="table-primary-text">{t.name || t.full_name}</div>
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
