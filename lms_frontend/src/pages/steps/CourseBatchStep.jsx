import React, { useState, useEffect } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { registrationApi } from '../../api/registrationApi';
import { FeeSummaryCard } from './FeeSummaryCard';

export const CourseBatchStep = () => {
  const { formData, saveStep, mode, isLoading, error: contextError } = useRegistration();

  const [localData, setLocalData] = useState({
    course_id: '',
    batch_id: '',
  });

  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    // Attempt to persist previously saved choices
    if (formData.course_batch) {
      setLocalData({
        course_id: formData.course_batch.course_id || '',
        batch_id:  formData.course_batch.batch_id || '',
      });
    }

    const loadCourses = async () => {
      setLoadingLists(true);
      try {
        const { courses } = await registrationApi.listCourses();
        setCourses(courses || []);
      } catch (err) {
        setFetchError('Failed to load courses.');
      } finally {
        setLoadingLists(false);
      }
    };

    loadCourses();
  }, [formData.course_batch]);

  useEffect(() => {
    const loadBatches = async () => {
      if (!localData.course_id) {
        setBatches([]);
        return;
      }
      setLoadingLists(true);
      try {
        const { batches } = await registrationApi.listBatches(localData.course_id);
        setBatches(batches || []);
      } catch (err) {
        setFetchError('Failed to load batches.');
        setBatches([]);
      } finally {
        setLoadingLists(false);
      }
    };

    loadBatches();
  }, [localData.course_id]);

  const handleCourseChange = (e) => {
    setLocalData({ course_id: e.target.value, batch_id: '' });
  };

  const handleBatchChange = (e) => {
    setLocalData(prev => ({ ...prev, batch_id: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await saveStep(4, 'course_batch', localData);
  };

  const isViewOnly = mode === 'view';

  return (
    <div className="step-card">
      <div className="step-header">
        <h2 className="step-title">Course & Batch</h2>
        <p className="step-subtitle">Select the learning program and schedule.</p>
      </div>

      {(contextError || fetchError) && <div className="alert alert-error">{contextError || fetchError}</div>}

      <form onSubmit={handleSubmit} className="form-grid">
        <div className="input-group full-width">
          <label>Course *</label>
          <select 
            name="course_id" 
            className="auth-input" 
            value={localData.course_id} 
            onChange={handleCourseChange}
            disabled={isViewOnly || loadingLists}
            required
          >
            <option value="" disabled>Select a Course</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>
                {course.name} — ₹{course.base_fee}
              </option>
            ))}
          </select>
        </div>

        <div className="input-group full-width" style={{ marginTop: '16px' }}>
          <label>Batch * (Select Course First)</label>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
            {batches.length === 0 && localData.course_id && !loadingLists ? (
              <p style={{ color: 'var(--gray-text)', fontSize: '14px' }}>No active batches found for this course.</p>
            ) : null}

            {batches.map(batch => (
              <label 
                key={batch.id} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: '12px', 
                  padding: '16px', 
                  border: `2px solid ${localData.batch_id === batch.id ? 'var(--primary-blue)' : 'var(--gray-border)'}`, 
                  borderRadius: '8px',
                  cursor: (isViewOnly || batch.is_full) ? 'not-allowed' : 'pointer',
                  backgroundColor: batch.is_full ? '#f8fafc' : 'var(--white)',
                  opacity: batch.is_full ? 0.7 : 1
                }}
              >
                <input 
                  type="radio" 
                  name="batch_id" 
                  value={batch.id} 
                  checked={localData.batch_id === batch.id} 
                  onChange={handleBatchChange}
                  disabled={isViewOnly || batch.is_full}
                  style={{ marginTop: '4px' }}
                  required
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--navy-bg)' }}>{batch.name}</span>
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: 600, 
                      padding: '2px 8px', 
                      borderRadius: '12px',
                      backgroundColor: batch.is_full ? '#fee2e2' : '#e0f2fe',
                      color: batch.is_full ? '#b91c1c' : '#0369a1'
                    }}>
                      {batch.is_full ? 'Full' : `${batch.seats_remaining} seats left`}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--gray-text)', marginBottom: '4px' }}>{batch.schedule}</p>
                  <p style={{ fontSize: '12px', color: '#94a3b8' }}>Starts: {new Date(batch.start_date).toLocaleDateString()}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* If viewing, or if we have already saved it and are just viewing the cached fee details */}
        {formData.course_batch && formData.course_batch.total_fee && (
          <div className="full-width">
            <FeeSummaryCard feeDetails={formData.course_batch} />
          </div>
        )}

        {!isViewOnly && (
          <div className="wizard-actions full-width" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled={isLoading} style={{ width: 'auto', padding: '12px 32px' }}>
              {isLoading ? <div className="spinner"></div> : 'Save & Calculate Fees'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
