import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Bell, Award, Flame, Zap, LogOut, ClipboardList, BarChart2, MessageSquare } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import '../../styles/student-portal.css';

const StudentDashboard = () => {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [intUnread, setIntUnread] = useState(0);
  const navigate                  = useNavigate();
  const { user, logout }          = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axiosInstance.get('/api/student/dashboard');
        setData(response.data);
      } catch (err) {
        console.error('Failed to load dashboard', err);
      } finally {
        setLoading(false);
      }
    };
    const fetchUnread = async () => {
      try {
        const res = await axiosInstance.get('/api/student/notifications/count');
        setIntUnread(res.data?.unread_count || 0);
      } catch (_) { /* ignore — non-critical */ }
    };
    fetchData();
    fetchUnread();
  }, []);

  if (loading) return (
    <div className="student-portal-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--primary-blue)' }}>Loading your dashboard…</div>
    </div>
  );
  if (!data) return (
    <div className="student-portal-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--error)' }}>Failed to load dashboard. Please refresh.</div>
    </div>
  );

  // Derive all display values from the actual API response
  const strFirstName  = data.first_name || user?.email?.split('@')[0] || 'Student';
  const strCourseId   = data.course_id;
  const strCourseName = data.course_name || 'Your Course';
  const intPct        = data.enrollment_status === 'active' ? (data.completion_pct || 0) : 0;
  const intStroke     = 283;
  const intOffset     = intStroke - (intStroke * intPct) / 100;
  const intStreak     = data.streak?.current_streak_days || 0;
  const intLongest    = data.streak?.longest_streak_days || 0;
  const arrTasks      = data.upcoming_tasks || [];
  const objLastItem   = data.last_accessed_content || null;

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="student-portal-layout">
      {/* ── Top Navbar ── */}
      <nav className="student-navbar">
        <div className="student-nav-brand" onClick={() => navigate('/student/dashboard')}>
          Acadeno LMS
        </div>
        <div className="student-nav-links">
          <span className="student-nav-link active">Dashboard</span>
          {strCourseId && (
            <span className="student-nav-link" onClick={() => navigate(`/student/courses/${strCourseId}/content`)}>
              Course
            </span>
          )}
          <span className="student-nav-link" onClick={() => navigate('/student/tasks')}>
            <ClipboardList size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Tasks
          </span>
          <span className="student-nav-link" onClick={() => navigate('/student/progress')}>
            <BarChart2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Progress
          </span>
          <span className="student-nav-link" onClick={() => navigate('/student/discussions')}>
            <MessageSquare size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Discussions
          </span>

          {/* ── Notification Bell ── */}
          <span
            className="student-nav-link"
            onClick={() => navigate('/student/dashboard')}
            style={{ position: 'relative', cursor: 'pointer' }}
            title="Notifications"
          >
            <Bell size={18} />
            {intUnread > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: 'var(--error)', color: 'white',
                borderRadius: '50%', fontSize: 10, fontWeight: 700,
                width: 16, height: 16, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>
                {intUnread > 9 ? '9+' : intUnread}
              </span>
            )}
          </span>

          {/* Logout */}
          <span
            className="student-nav-link"
            onClick={handleLogout}
            style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          >
            <LogOut size={14} /> Logout
          </span>
        </div>
      </nav>

      <div className="student-content">
        {/* ── Welcome Header ── */}
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, color: 'var(--navy-bg)' }}>
            Welcome back, <span style={{ color: 'var(--primary-blue)' }}>{strFirstName}!</span>
          </h1>
          <p style={{ color: 'var(--gray-text)' }}>Here is what's happening in your academy journey.</p>
        </header>

        {/* ── Certificate Banner (100% only) ── */}
        {intPct === 100 && data.certificate_available && (
          <div className="cert-banner">
            <div>
              <h2 style={{ fontSize: 20, marginBottom: 8, color: 'white' }}>🎉 Course Complete!</h2>
              <p style={{ opacity: 0.9 }}>Your completion certificate is now available.</p>
            </div>
            <button
              className="btn-secondary"
              style={{ border: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => window.open(`/api/student/certificates/${data.enrollment_id}`, '_blank')}
            >
              <Award size={18} /> View Certificate
            </button>
          </div>
        )}

        <div className="dash-grid">
          {/* ── Course Progress (Circular) ── */}
          <div className="student-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h2>Course Progress</h2>
            <div className="circular-progress-container">
              <svg width="120" height="120" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="45" fill="none"
                  stroke="var(--primary-blue)" strokeWidth="10"
                  strokeDasharray={intStroke}
                  strokeDashoffset={intOffset}
                  transform="rotate(-90 50 50)"
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
                <text x="50" y="55" fontSize="20" fontWeight="bold" fill="#0a192f" textAnchor="middle">
                  {intPct}%
                </text>
              </svg>
            </div>
            <p style={{ marginTop: 8, fontWeight: 500, textAlign: 'center', color: 'var(--navy-bg)' }}>
              {strCourseName}
            </p>
            {data.enrolled_course && (
              <p style={{ fontSize: 12, color: 'var(--gray-text)', marginTop: 4 }}>
                {data.enrolled_course.completed_items} / {data.enrolled_course.total_content_items} items completed
              </p>
            )}
          </div>

          {/* ── Streak Counter ── */}
          <div className="student-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h2>Learning Streak</h2>
            <Flame size={56} color={intStreak > 0 ? '#ef4444' : '#cbd5e1'} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--navy-bg)' }}>
              {intStreak} {intStreak === 1 ? 'Day' : 'Days'}
            </div>
            <p style={{ color: 'var(--gray-text)', marginTop: 8, fontSize: 13 }}>
              {intStreak > 0 ? `Longest streak: ${intLongest} days` : 'Start learning to build your streak!'}
            </p>
          </div>

          {/* ── Upcoming Tasks ── */}
          <div className="student-card">
            <h2>Upcoming Tasks</h2>
            {arrTasks.length === 0 ? (
              <p style={{ color: 'var(--gray-text)', fontSize: 14 }}>No upcoming tasks — you're all caught up! 🎉</p>
            ) : (
              <div className="task-list">
                {arrTasks.map(objTask => (
                  <div
                    key={objTask.id}
                    className={`task-item ${objTask.days_remaining <= 1 ? 'urgent' : ''}`}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{objTask.title}</div>
                      <div style={{
                        fontSize: 12,
                        color: objTask.days_remaining <= 1 ? 'var(--error)' : 'var(--gray-text)',
                        marginTop: 4
                      }}>
                        Due in {objTask.days_remaining} {objTask.days_remaining === 1 ? 'day' : 'days'}
                      </div>
                    </div>
                    <button
                      className="btn-outline"
                      style={{ padding: '6px 12px', fontSize: 12 }}
                      onClick={() => navigate('/student/tasks')}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Resume Learning ── */}
          <div className="student-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <h2>Resume Learning</h2>
            <div style={{
              flex: 1,
              display: 'flex', flexDirection: 'column',
              justifyContent: 'center', alignItems: 'center',
              background: 'var(--gray-light)', borderRadius: 8, padding: 24, textAlign: 'center'
            }}>
              <BookOpen size={40} color="var(--primary-blue)" style={{ marginBottom: 16 }} />
              {objLastItem ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{objLastItem.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-text)', marginBottom: 16, textTransform: 'capitalize' }}>
                    {objLastItem.content_type}
                  </div>
                  <button
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    onClick={() => navigate(`/student/content/${objLastItem.id}/watch`)}
                  >
                    <Zap size={16} /> Quick Resume
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 16, color: 'var(--gray-text)' }}>
                    No recent activity yet.
                  </div>
                  {strCourseId && (
                    <button
                      className="btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                      onClick={() => navigate(`/student/courses/${strCourseId}/content`)}
                    >
                      <Zap size={16} /> Start Learning
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
