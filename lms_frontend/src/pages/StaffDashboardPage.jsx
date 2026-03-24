import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import '../styles/leads.css'; // Reusing some table styles

const StaffDashboardPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editingBatch, setEditingBatch] = useState(null);
    const [editForm, setEditForm] = useState({ capacity: '', schedule: '' });

    useEffect(() => {
        fetchCourses();
    }, []);

    const fetchCourses = async () => {
        try {
            const res = await axiosInstance.get('/api/registration/courses');
            setCourses(res.data.courses);
            if (res.data.courses.length > 0) {
                handleCourseSelect(res.data.courses[0].id);
            }
        } catch (err) {
            setError('Failed to load courses');
        } finally {
            setLoading(false);
        }
    };

    const handleCourseSelect = async (courseId) => {
        setLoading(true);
        setSelectedCourse(courseId);
        try {
            const res = await axiosInstance.get(`/api/registration/courses/${courseId}/batches`);
            // If trainer, filter batches where trainer_id matches
            let filteredBatches = res.data.batches;
            if (user?.role === 'trainer') {
                filteredBatches = filteredBatches.filter(b => b.trainer_id === user.id);
            }
            setBatches(filteredBatches);
        } catch (err) {
            setError('Failed to load batches');
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (batch) => {
        setEditingBatch(batch.id);
        setEditForm({ capacity: batch.capacity, schedule: batch.schedule });
    };

    const handleUpdate = async (batchId) => {
        try {
            await axiosInstance.patch(`/api/registration/batches/${batchId}`, editForm);
            setEditingBatch(null);
            handleCourseSelect(selectedCourse); // Refresh
            alert('Batch updated successfully');
        } catch (err) {
            alert(err.response?.data?.error || 'Update failed');
        }
    };

    if (loading && courses.length === 0) return <div>Loading...</div>;

    return (
        <div className="leads-container">
            <header className="page-header">
                <h1>{user.role === 'super_admin' ? 'Admin' : 'Trainer'} Dashboard</h1>
                <p>Manage batch capacities and schedules</p>
            </header>

            {/* EPIC-08: HR & Admin Quick Links */}
            {(user.role === 'hr' || user.role === 'super_admin') && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    <button
                        onClick={() => navigate('/batches')}
                        style={{ padding: '8px 16px', background: 'var(--navy-bg)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                    >
                        Batches
                    </button>
                    <button
                        onClick={() => navigate('/hr/enrollments')}
                        style={{ padding: '8px 16px', background: 'var(--navy-bg)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                    >
                        Enrollments
                    </button>
                    <button
                        onClick={() => navigate('/hr/reports')}
                        style={{ padding: '8px 16px', background: 'var(--navy-bg)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                    >
                        Reports
                    </button>
                    {user.role === 'super_admin' && (
                        <>
                            <button
                                onClick={() => navigate('/admin/settings')}
                                style={{ padding: '8px 16px', background: '#64748b', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                            >
                                System Settings
                            </button>
                            <button
                                onClick={() => navigate('/admin/analytics')}
                                style={{ padding: '8px 16px', background: '#64748b', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
                            >
                                Analytics
                            </button>
                        </>
                    )}
                </div>
            )}

            {error && <div className="alert alert-error">{error}</div>}

            <div className="filter-section" style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
                <label>Select Course:</label>
                <select 
                    value={selectedCourse} 
                    onChange={(e) => handleCourseSelect(e.target.value)}
                    className="form-input"
                    style={{ width: 'auto' }}
                >
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </div>

            <div className="leads-table-container">
                <table className="leads-table">
                    <thead>
                        <tr>
                            <th>Batch Name</th>
                            <th>Schedule</th>
                            <th>Capacity</th>
                            <th>Enrolled</th>
                            <th>Seats Left</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {batches.length > 0 ? batches.map(batch => (
                            <tr key={batch.id}>
                                <td>{batch.name}</td>
                                <td>
                                    {editingBatch === batch.id ? (
                                        <input 
                                            type="text" 
                                            value={editForm.schedule} 
                                            onChange={(e) => setEditForm({...editForm, schedule: e.target.value})}
                                            className="form-input"
                                        />
                                    ) : batch.schedule}
                                </td>
                                <td>
                                    {editingBatch === batch.id ? (
                                        <input 
                                            type="number" 
                                            value={editForm.capacity} 
                                            onChange={(e) => setEditForm({...editForm, capacity: e.target.value})}
                                            className="form-input"
                                            style={{ width: '80px' }}
                                        />
                                    ) : batch.capacity}
                                </td>
                                <td>{batch.enrolled_count}</td>
                                <td>{batch.capacity - batch.enrolled_count}</td>
                                <td>
                                    <span className={`status-badge ${batch.is_active ? 'status-active' : 'status-cold'}`}>
                                        {batch.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td>
                                    {editingBatch === batch.id ? (
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button className="btn-primary" onClick={() => handleUpdate(batch.id)}>Save</button>
                                            <button className="btn-secondary" onClick={() => setEditingBatch(null)}>Cancel</button>
                                        </div>
                                    ) : (
                                        <button className="btn-secondary" onClick={() => startEdit(batch)}>Edit</button>
                                    )}
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="7" style={{ textAlign: 'center' }}>No batches found.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default StaffDashboardPage;
