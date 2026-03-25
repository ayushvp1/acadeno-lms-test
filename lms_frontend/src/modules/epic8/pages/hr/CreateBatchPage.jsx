// ==========================================================================
// ACADENO LMS — Create Batch Page (US-HR-01 Modular)
// ==========================================================================
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { batchApi } from '../../api/batchApi';
import axiosInstance from '../../../../api/axiosInstance';
import '../../../../styles/hr.css';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CreateBatchPage = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    course_id: '', batch_name: '', batch_code: '', start_date: '', end_date: '', capacity: '',
    schedule_type: 'weekday', class_days: [], class_time_start:'', class_time_end: '', meeting_url: '',
  });

  useEffect(() => { axiosInstance.get('/api/courses').then(r => setCourses(r.data.courses || [])).catch(() => {}); }, []);

  const handleChange = (e) => { setForm(prev => ({ ...prev, [e.target.name]: e.target.value })); };
  const toggleDay = (day) => { setForm(prev => ({ ...prev, class_days: prev.class_days.includes(day) ? prev.class_days.filter(d => d !== day) : [...prev.class_days, day] })); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(null); setSubmitting(true);
    try {
      const payload = { ...form, capacity: Number(form.capacity) };
      const data = await batchApi.createBatch(payload);
      navigate(`/batches/${data.batch.id}`);
    } catch (err) { setError(err.response?.data?.error || 'Failed to create batch'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="hr-container hr-form-page">
      <div className="page-header"><div><h1>Create New Batch</h1></div></div>
      {error && <div className="alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-card">
          <div className="form-row">
            <div className="form-field"><label>Course *</label>
              <select name="course_id" value={form.course_id} onChange={handleChange} required>
                <option value="">Select a course…</option>{courses.map(c => (<option key={c.id} value={c.id}>{c.course_name}</option>))}
              </select>
            </div>
            <div className="form-field"><label>Batch Name *</label><input type="text" name="batch_name" value={form.batch_name} onChange={handleChange} required /></div>
          </div>
          <div className="form-row">
            <div className="form-field"><label>Batch Code</label><input type="text" name="batch_code" value={form.batch_code} onChange={handleChange} /></div>
            <div className="form-field"><label>Capacity *</label><input type="number" name="capacity" value={form.capacity} onChange={handleChange} required min={1} /></div>
          </div>
          <div className="form-row">
            <div className="form-field"><label>Start Date *</label><input type="date" name="start_date" value={form.start_date} onChange={handleChange} required /></div>
            <div className="form-field"><label>End Date</label><input type="date" name="end_date" value={form.end_date} onChange={handleChange} /></div>
          </div>
          <div className="form-field"><label>Meeting URL</label><input type="url" name="meeting_url" value={form.meeting_url} onChange={handleChange} /></div>
          <div className="form-actions">
            <button type="button" className="btn-sm btn-ghost-sm" onClick={() => navigate('/batches')}>Cancel</button>
            <button type="submit" className="btn-sm btn-primary-sm" disabled={submitting}>{submitting ? 'Creating…' : 'Create Batch'}</button>
          </div>
        </div>
      </form>
    </div>
  );
};
export default CreateBatchPage;
