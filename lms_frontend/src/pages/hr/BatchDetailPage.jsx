import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { hrAdminApi } from '../../api/hrAdminApi';
import { ArrowLeft, UserPlus, Save, CheckCircle, Clock } from 'lucide-react';
import '../../styles/epic8.css';

const BatchDetailPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [batch, setBatch] = useState(null);
    const [loading, setLoading] = useState(true);
    const [trainers, setTrainers] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchBatchDetails();
    }, [id]);

    const fetchBatchDetails = async () => {
        try {
            setLoading(true);
            const batchRes = await hrAdminApi.getBatch(id);
            setBatch(batchRes.batch);
            
            if (batchRes.batch?.course_id) {
                const poolRes = await hrAdminApi.listTrainerPool(batchRes.batch.course_id);
                setTrainers(poolRes.trainers || []);
            }
        } catch (err) {
            setError('Failed to load batch context');
        } finally {
            setLoading(false);
        }
    };

    const handleTrainerAssign = async (trainerId) => {
        try {
            await hrAdminApi.assignTrainer(id, trainerId);
            fetchBatchDetails();
        } catch (err) {
            alert('Selection failed: Trainer not in pool');
        }
    };

    const handleAutoAssign = async () => {
        try {
            await hrAdminApi.autoAssignTrainer(id);
            fetchBatchDetails();
        } catch (err) {
            alert('Auto-assign failed: No trainers available in pool');
        }
    };

    if (loading) return <div className="epic8-loader-container"><div className="spinner"></div></div>;

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="icon-btn-round" onClick={() => navigate('/batches')}>
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1>Cohort: {batch?.name || 'Unknown Cohort'}</h1>
                        <p>{batch?.batch_code || '---'} • {batch?.status?.toUpperCase() || 'NO STATUS'}</p>
                    </div>
                </div>
            </div>

            <div className="analytics-layout">
                <div className="premium-card" style={{ padding: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h2>Trainer Allocation</h2>
                        <button className="btn-secondary" onClick={handleAutoAssign}>
                            Auto-Assign Trainer
                        </button>
                    </div>
                    {batch?.trainer_id ? (
                        <div className="alert-success">
                            <CheckCircle size={20} />
                            Currently Mentored by: <strong>{batch.trainer_id}</strong>
                        </div>
                    ) : (
                        <div className="alert-error">
                            <Clock size={20} />
                            No trainer assigned to this cohort yet.
                        </div>
                    )}

                    <div style={{ marginTop: '2rem' }}>
                        <label style={{ display: 'block', fontWeight: 700, marginBottom: '1rem' }}>Assign Mentor from Approved Pool</label>
                        <ul className="trainer-selection-list">
                            {trainers.map(trainer => (
                                <li key={trainer.id} className="trainer-item">
                                    <div>
                                        <div className="table-primary-text">{trainer.name}</div>
                                        <div className="table-secondary-text">{trainer.email} • {trainer.active_batch_count} Active Batches</div>
                                    </div>
                                    <button 
                                        className={batch.trainer_id === trainer.id ? "btn-secondary" : "btn-premium-primary"}
                                        style={{ padding: '8px 16px' }}
                                        onClick={() => handleTrainerAssign(trainer.id)}
                                        disabled={batch.trainer_id === trainer.id}
                                    >
                                        {batch.trainer_id === trainer.id ? 'Assigned' : 'Allocate'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                
                <div className="premium-card" style={{ padding: '32px' }}>
                    <h2>Schedule Overview</h2>
                    <div className="stat-info" style={{ marginTop: '2rem' }}>
                        <div className="review-item" style={{ marginBottom: '1rem' }}>
                            <span className="review-label">Start Date</span>
                            <span className="review-value">{new Date(batch?.start_date).toLocaleDateString()}</span>
                        </div>
                        <div className="review-item" style={{ marginBottom: '1rem' }}>
                            <span className="review-label">Weekly Schedule</span>
                            <span className="review-value">{batch?.schedule_type?.toUpperCase() || 'N/A'}</span>
                        </div>
                        <div className="review-item">
                            <span className="review-label">Virtual Classroom</span>
                            <span className="review-value" style={{ color: 'var(--primary-blue)', textDecoration: 'underline' }}>
                                {batch?.meeting_url || 'No URL Configured'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BatchDetailPage;
