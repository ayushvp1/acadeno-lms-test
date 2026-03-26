import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ClipboardList, CheckCircle, Clock, AlertCircle, RotateCcw } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import '../../styles/student-portal.css';

// ── Derive a display status from the nested API shape ──────────────────────
// API returns: { tasks: [{ task: { id, title, due_date, is_overdue, … }, submission: {…} | null }] }
function deriveStatus(objTaskItem) {
  const objSub = objTaskItem.submission;
  if (!objSub) {
    return objTaskItem.task.is_overdue ? 'overdue' : 'not_submitted';
  }
  return objSub.status; // 'submitted' | 'evaluated' | 'reopened'
}

// ── Status icon helper ─────────────────────────────────────────────────────
function StatusIcon({ strStatus }) {
  if (strStatus === 'evaluated')    return <CheckCircle size={14} color="var(--success)" />;
  if (strStatus === 'submitted')    return <Clock size={14} color="#2563eb" />;
  if (strStatus === 'overdue')      return <AlertCircle size={14} color="var(--error)" />;
  if (strStatus === 'reopened')     return <RotateCcw size={14} color="#f59e0b" />;
  return null;
}

const TaskSubmissionPage = () => {
  const [arrTaskItems,   setArrTaskItems]   = useState([]);
  const [objDetail,      setObjDetail]      = useState(null); // flat task detail from GET /tasks/:id
  const [strResponseTxt, setStrResponseTxt] = useState('');
  const [objFile,        setObjFile]        = useState(null);
  const [boolLoading,    setBoolLoading]    = useState(true);
  const [boolSubmitting, setBoolSubmitting] = useState(false);
  const [strError,       setStrError]       = useState(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => { fetchTaskList(); }, []);

  // ── Fetch task list ──────────────────────────────────────────────────────
  const fetchTaskList = async () => {
    setBoolLoading(true);
    try {
      const res = await axiosInstance.get('/api/student/tasks');
      // res.data.tasks = [{ task: {…}, submission: {…}|null }]
      setArrTaskItems(res.data.tasks || []);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setBoolLoading(false);
    }
  };

  // ── Load full task detail ────────────────────────────────────────────────
  const loadDetail = async (strTaskId) => {
    setObjDetail(null);
    setStrError(null);
    try {
      // Response: { id, title, description, rubric, due_date, max_score,
      //             task_type, time_remaining_seconds, student_submission | null }
      const res = await axiosInstance.get(`/api/student/tasks/${strTaskId}`);
      setObjDetail(res.data);
      setStrResponseTxt(res.data.student_submission?.response_text || '');
    } catch (err) {
      console.error('Failed to load task detail', err);
    }
  };

  // ── Submit task ──────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!objDetail || boolSubmitting) return;
    setBoolSubmitting(true);
    setStrError(null);

    const formData = new FormData();
    formData.append('response_text', strResponseTxt);
    if (objFile) formData.append('file', objFile);

    try {
      await axiosInstance.post(`/api/student/tasks/${objDetail.id}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('Task submitted successfully! ✅');
      await fetchTaskList();
      await loadDetail(objDetail.id);
    } catch (err) {
      if (err.response?.status === 423) {
        setStrError('This task is locked. Ask your trainer to reopen it before resubmitting.');
      } else {
        setStrError(err.response?.data?.error || 'Failed to submit. Please try again.');
      }
    } finally {
      setBoolSubmitting(false);
    }
  };

  if (boolLoading) return (
    <div className="student-portal-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ padding: 40, color: 'var(--primary-blue)' }}>Loading tasks…</div>
    </div>
  );

  const objSub = objDetail?.student_submission || null;
  const boolLocked = objSub && (objSub.status === 'submitted' || objSub.status === 'evaluated');

  return (
    <div className="student-portal-layout">
      {/* ── Navbar ── */}
      <nav className="student-navbar">
        <div className="student-nav-brand" onClick={() => navigate('/student/dashboard')}>Acadeno LMS</div>
        <div className="student-nav-links">
          <span className="student-nav-link" onClick={() => navigate('/student/dashboard')}>Dashboard</span>
          <span className="student-nav-link active">
            <ClipboardList size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Tasks
          </span>
          <span className="student-nav-link" onClick={() => navigate('/student/progress')}>Progress</span>
          <span
            className="student-nav-link"
            onClick={logout}
            style={{ color: 'var(--error)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
          >
            <LogOut size={14} /> Logout
          </span>
        </div>
      </nav>

      <div className="student-content">
        <div className="course-layout">
          {/* ── Left: Task List ── */}
          <div className="course-sidebar" style={{ width: 340 }}>
            <h2 style={{ fontSize: 18, marginBottom: 16 }}>Your Tasks</h2>
            {arrTaskItems.length === 0 ? (
              <p style={{ color: 'var(--gray-text)', fontSize: 14 }}>No tasks assigned yet.</p>
            ) : (
              <div className="task-list">
                {arrTaskItems.map(objItem => {
                  const strStatus = deriveStatus(objItem);
                  const boolActive = objDetail?.id === objItem.task.id;
                  return (
                    <div
                      key={objItem.task.id}
                      className="task-item"
                      onClick={() => loadDetail(objItem.task.id)}
                      style={{
                        cursor: 'pointer',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        borderLeft: boolActive ? '4px solid var(--primary-blue)' : '4px solid transparent',
                        background: boolActive ? '#eff6ff' : undefined,
                        gap: 0,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                        {objItem.task.title}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: 'var(--gray-text)' }}>
                          Due: {new Date(objItem.task.due_date).toLocaleDateString()}
                        </span>
                        <span className={`task-status-badge status-${strStatus}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <StatusIcon strStatus={strStatus} />
                          {strStatus.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right: Task Detail & Form ── */}
          <div className="course-main" style={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {!objDetail ? (
              <div style={{ textAlign: 'center', color: 'var(--gray-text)', marginTop: 100 }}>
                <ClipboardList size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                <p>Select a task from the list to view details and submit your work.</p>
              </div>
            ) : (
              <div>
                {/* ── Task Header ── */}
                <h1 style={{ marginBottom: 8, color: 'var(--navy-bg)' }}>{objDetail.title}</h1>
                <div style={{ display: 'flex', gap: 20, marginBottom: 24, fontSize: 13, color: 'var(--gray-text)', flexWrap: 'wrap' }}>
                  <span>Max Score: <strong style={{ color: 'var(--navy-bg)' }}>{objDetail.max_score}</strong></span>
                  <span>Due: <strong style={{ color: objDetail.time_remaining_seconds < 0 ? 'var(--error)' : 'var(--navy-bg)' }}>
                    {new Date(objDetail.due_date).toLocaleString()}
                  </strong></span>
                  {objDetail.time_remaining_seconds < 0 && (
                    <span style={{ color: 'var(--error)', fontWeight: 600 }}>⚠ Overdue</span>
                  )}
                </div>

                {/* ── Instructions ── */}
                <div className="student-card" style={{ background: 'var(--gray-light)', boxShadow: 'none', marginBottom: 16 }}>
                  <h3 style={{ marginBottom: 8 }}>Instructions</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6 }}>{objDetail.description}</p>
                </div>

                {/* ── Rubric (if present) ── */}
                {objDetail.rubric && (
                  <div className="student-card" style={{ background: '#f8fafc', boxShadow: 'none', border: '1px solid var(--gray-border)', marginBottom: 16 }}>
                    <h3 style={{ marginBottom: 8 }}>Rubric</h3>
                    <p style={{ fontSize: 13, lineHeight: 1.6 }}>{objDetail.rubric}</p>
                  </div>
                )}

                {/* ── Evaluation Result (if graded) ── */}
                {objSub?.status === 'evaluated' && (
                  <div className="cert-banner" style={{ background: 'var(--navy-bg)', marginBottom: 24 }}>
                    <div>
                      <h3 style={{ color: 'white', marginBottom: 4 }}>Evaluation Complete ✓</h3>
                      <p style={{ color: '#94a3b8', fontSize: 14 }}>
                        Score: <strong style={{ color: 'white' }}>{objSub.score}</strong> / {objDetail.max_score}
                      </p>
                      {objSub.feedback && (
                        <p style={{ color: 'white', marginTop: 8, fontStyle: 'italic', fontSize: 14 }}>
                          "{objSub.feedback}"
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Submission Form ── */}
                <h3 style={{ marginTop: 24, marginBottom: 16, borderBottom: '1px solid var(--gray-border)', paddingBottom: 8 }}>
                  Your Submission
                </h3>

                {strError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#991b1b', fontSize: 14 }}>
                    {strError}
                  </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <textarea
                    className="auth-input"
                    style={{ minHeight: 150, resize: 'vertical', fontFamily: 'inherit' }}
                    placeholder="Type your response here…"
                    value={strResponseTxt}
                    onChange={(e) => setStrResponseTxt(e.target.value)}
                    disabled={boolLocked}
                    required
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 500 }}>Upload File (Optional)</label>
                    <input
                      type="file"
                      onChange={(e) => setObjFile(e.target.files[0])}
                      disabled={boolLocked}
                      className="auth-input"
                    />
                    {objSub?.s3_key && (
                      <span style={{ fontSize: 12, color: 'var(--gray-text)' }}>
                        Previously uploaded: {objSub.s3_key}
                      </span>
                    )}
                  </div>

                  {!boolLocked ? (
                    <button
                      type="submit"
                      className="btn-primary"
                      style={{ width: 200, alignSelf: 'flex-start' }}
                      disabled={boolSubmitting}
                    >
                      {boolSubmitting ? 'Submitting…' : 'Submit Task'}
                    </button>
                  ) : (
                    <div style={{ color: 'var(--gray-text)', fontStyle: 'italic', fontSize: 14 }}>
                      {objSub.status === 'evaluated' ? 'Task has been evaluated.' : 'Task is locked — awaiting evaluation.'}
                    </div>
                  )}
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskSubmissionPage;
