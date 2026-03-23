import React, { useEffect, useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useAuth } from '../context/AuthContext';

const StudentDashboardPage = () => {
  const { user } = useAuth();
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStudentData = async () => {
      try {
        // Fetch all registrations for this student (user)
        const response = await axiosInstance.get('/api/registration');
        // If there's at least one registration, take the first one's course details
        if (response.data.registrations && response.data.registrations.length > 0) {
          setStudentData(response.data.registrations[0]);
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchStudentData();
  }, []);

  if (loading) return <div className="loading">Loading Student Dashboard...</div>;
  if (error) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="leads-container" style={{ padding: '40px' }}>
      <div className="page-header" style={{ marginBottom: '32px' }}>
        <h1>Student Dashboard</h1>
      </div>

      <div className="detail-card" style={{ padding: '32px', maxWidth: '800px' }}>
        <h2 style={{ color: 'var(--navy-bg)', marginBottom: '24px' }}>Welcome, {studentData?.personal_details?.first_name || user?.email}!</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px' }}>
          <div className="stat-card" style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px' }}>
            <span className="stat-label" style={{ color: '#64748b', fontSize: '13px', display: 'block', marginBottom: '8px' }}>Course</span>
            <span className="stat-value" style={{ fontSize: '18px', fontWeight: '600', color: '#1e3a5f' }}>
              {studentData?.course_batch?.course_name || 'Not Enrolled'}
            </span>
          </div>

          <div className="stat-card" style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px' }}>
            <span className="stat-label" style={{ color: '#64748b', fontSize: '13px', display: 'block', marginBottom: '8px' }}>Registration ID</span>
            <span className="stat-value" style={{ fontSize: '18px', fontWeight: '600', color: '#1e3a5f' }}>
              {studentData?.registration_number || 'N/A'}
            </span>
          </div>

          <div className="stat-card" style={{ backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px' }}>
            <span className="stat-label" style={{ color: '#64748b', fontSize: '13px', display: 'block', marginBottom: '8px' }}>Status</span>
            <span className={`status-badge status-${studentData?.status || 'unknown'}`} style={{ marginTop: '4px' }}>
              {studentData?.status || 'N/A'}
            </span>
          </div>
        </div>

        {studentData?.course_batch && (
           <div style={{ marginTop: '40px', padding: '24px', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
             <h3 style={{ fontSize: '16px', color: '#1e3a5f', marginBottom: '16px' }}>Enrolled Batch Details</h3>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '14px' }}>
               <div><span style={{ color: '#64748b' }}>Batch:</span> {studentData.course_batch.batch_name}</div>
               <div><span style={{ color: '#64748b' }}>Schedule:</span> {studentData.course_batch.schedule}</div>
               <div><span style={{ color: '#64748b' }}>Payment status:</span> <span style={{ color: studentData.status === 'pending_payment' ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                 {studentData.status === 'pending_payment' ? 'Pending Payment' : 'Confirmed'}
               </span></div>
             </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboardPage;
