import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { hrAdminApi } from '../../api/hrAdminApi';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import '../../styles/epic8.css';

const CreateBatchPage = () => {
    const navigate = useNavigate();
    const [batchData, setBatchData] = useState({
        course_id: '',
        name: '',
        batch_code: '',
        start_date: '',
        end_date: '',
        capacity: 30,
        schedule_type: 'weekday',
        class_days: [],
        class_time_start: '10:00:00',
        class_time_end: '12:00:00',
        meeting_url: '',
        trainer_id: ''
    });
    const [trainers, setTrainers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);
            setError('');
            await hrAdminApi.createBatch(batchData);
            navigate('/batches');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create batch. Please check inputs.');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = async (e) => {
        const { name, value } = e.target;
        setBatchData(prev => ({ ...prev, [name]: value }));

        // Fetch trainers if course changes
        if (name === 'course_id' && value) {
            try {
                const data = await hrAdminApi.listTrainerPool(value);
                setTrainers(data.trainers || []);
            } catch (err) {
                console.error('Failed to load trainer pool');
            }
        }
    };

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="icon-btn-round" onClick={() => navigate('/batches')}>
                        <ArrowLeft size={24} />
                    </button>
                    <div>
                        <h1>Create New Batch</h1>
                        <p>Configure a new learning cohort and schedule</p>
                    </div>
                </div>
                <button type="submit" form="create-batch-form" disabled={loading} className="btn-premium-primary">
                    {loading ? <div className="spinner-small" /> : <Save size={18} />}
                    Save Batch Plan
                </button>
            </div>

            {error && (
                <div className="alert-error" style={{ marginBottom: '2rem' }}>
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

            <form id="create-batch-form" onSubmit={handleSubmit} className="premium-card generic-form">
                <div className="form-grid">
                    <div className="form-group full-width">
                        <label>Target Program / Course *</label>
                        <select 
                            name="course_id" 
                            value={batchData.course_id} 
                            onChange={handleInputChange} 
                            required
                        >
                            <option value="">Select a course...</option>
                            <option value="123e4567-e89b-12d3-a456-426614174000">Full Stack Web Development</option>
                            <option value="123e4567-e89b-12d3-a456-426614174001">UI/UX Product Design</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Batch Name *</label>
                        <input 
                            name="name" 
                            type="text" 
                            value={batchData.name} 
                            onChange={handleInputChange} 
                            placeholder="e.g. Sept 2026 Morning Cohort" 
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label>Batch Code *</label>
                        <input 
                            name="batch_code" 
                            type="text" 
                            value={batchData.batch_code} 
                            onChange={handleInputChange} 
                            placeholder="e.g. AC-FS-26-09" 
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label>Start Date *</label>
                        <input 
                            name="start_date" 
                            type="date" 
                            value={batchData.start_date} 
                            onChange={handleInputChange} 
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label>End Date *</label>
                        <input 
                            name="end_date" 
                            type="date" 
                            value={batchData.end_date} 
                            onChange={handleInputChange} 
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label>Max. Capacity *</label>
                        <input 
                            name="capacity" 
                            type="number" 
                            value={batchData.capacity} 
                            onChange={handleInputChange} 
                            required 
                        />
                    </div>

                    <div className="form-group">
                        <label>Assign Initial Trainer (Optional)</label>
                        <select name="trainer_id" value={batchData.trainer_id} onChange={handleInputChange}>
                            <option value="">-- Leave Unassigned --</option>
                            {trainers.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.active_batch_count} Active)</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Schedule Type</label>
                        <select name="schedule_type" value={batchData.schedule_type} onChange={handleInputChange}>
                            <option value="weekday">Weekdays (Mon-Fri)</option>
                            <option value="weekend">Weekends (Sat-Sun)</option>
                            <option value="custom">Custom Schedule</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>Session Start Time *</label>
                        <input name="class_time_start" type="time" value={batchData.class_time_start} onChange={handleInputChange} required />
                    </div>

                    <div className="form-group">
                        <label>Session End Time *</label>
                        <input name="class_time_end" type="time" value={batchData.class_time_end} onChange={handleInputChange} required />
                    </div>

                    <div className="form-group full-width">
                        <label>Classroom / Meeting URL</label>
                        <input name="meeting_url" type="url" value={batchData.meeting_url} onChange={handleInputChange} placeholder="https://zoom.us/j/..." />
                    </div>
                </div>
            </form>
        </div>
    );
};

export default CreateBatchPage;
