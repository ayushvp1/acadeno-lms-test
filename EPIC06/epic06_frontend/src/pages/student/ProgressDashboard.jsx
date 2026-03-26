import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CalendarHeatmap from 'react-calendar-heatmap';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { Activity, Target, LayoutGrid, LogOut } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import '../../styles/student-portal.css';
import 'react-calendar-heatmap/dist/styles.css';

const ProgressDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [strError, setStrError] = useState(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const fetchProgress = async () => {
      try {
        const res = await axiosInstance.get('/api/student/progress');
        setData(res.data);
      } catch (err) {
        console.error('Failed to load progress', err);
        const intStatus = err.response?.status;
        const strMsg = err.response?.data?.detail || err.response?.data?.error || err.response?.data?.message || err.message || 'Network error — is the backend running on port 3002?';
        setStrError(`Error ${intStatus || 'NETWORK'}: ${strMsg}`);
      } finally {
        setLoading(false);
      }
    };
    fetchProgress();
  }, []);

  if (loading) return <div style={{ padding: 40 }}>Loading progress insights...</div>;
  if (!data) return (
    <div style={{ padding: 40 }}>
      <div style={{ color: 'var(--error)', fontWeight: 600, marginBottom: 8 }}>Failed to load dashboard.</div>
      {strError && <div style={{ color: 'var(--gray-text)', fontFamily: 'monospace', fontSize: 13, background: '#f8f9fa', padding: 12, borderRadius: 6, border: '1px solid #dee2e6' }}>{strError}</div>}
    </div>
  );

  const moduleData = (data.module_completion || []).map(m => ({
    name: m.module_title,
    Completion: Math.round((m.completed_items / (m.total_items || 1)) * 100),
    CompletedItems: m.completed_items,
    TotalItems: m.total_items
  }));

  const taskScoreData = (data.task_scores || []).map(t => ({
    name: t.task_title,
    Score: t.score !== null ? t.score : 0,
    Max: t.max_score
  }));

  const heatmapValues = (data.weekly_activity || []).map(a => ({
    date: new Date(a.date),
    count: a.count
  }));

  return (
    <div className="student-portal-layout">
      <nav className="student-navbar">
        <div className="student-nav-brand" onClick={() => navigate('/student/dashboard')}>Acadeno LMS</div>
        <div className="student-nav-links">
          <span className="student-nav-link" onClick={() => navigate('/student/dashboard')}>Dashboard</span>
          <span className="student-nav-link" onClick={() => navigate('/student/tasks')}>Tasks</span>
          <span className="student-nav-link active">Progress</span>
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
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, color: 'var(--navy-bg)' }}>Your Progress Dashboard</h1>
          <p style={{ color: 'var(--gray-text)' }}>Track your completion rates, activity streak, and task performance.</p>
        </header>

        <div className="dash-grid" style={{ gap: 32 }}>
          {/* Module Completion Chart */}
          <div className="student-card" style={{ gridColumn: 'span 2' }}>
            <h2><LayoutGrid size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Module Completion</h2>
            <div style={{ height: 300, width: '100%', marginTop: 24 }}>
              <ResponsiveContainer>
                <BarChart data={moduleData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: 'var(--text-dark)' }} />
                  <Tooltip cursor={{ fill: 'var(--gray-light)' }} formatter={(value, name) => [`${value}%`, name]} />
                  <Bar dataKey="Completion" fill="var(--primary-blue)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Activity Heatmap */}
          <div className="student-card heatmap-card" style={{ gridColumn: 'span 2' }}>
            <h2><Activity size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Annual Activity</h2>
            <div style={{ padding: 24, paddingBottom: 0 }}>
              <CalendarHeatmap
                startDate={new Date(new Date().setFullYear(new Date().getFullYear() - 1))}
                endDate={new Date()}
                values={heatmapValues}
                classForValue={(value) => {
                  if (!value || value.count === 0) return 'color-empty';
                  if (value.count < 2) return 'color-scale-1';
                  if (value.count < 4) return 'color-scale-2';
                  if (value.count < 6) return 'color-scale-3';
                  return 'color-scale-4';
                }}
                tooltipDataAttrs={value => {
                  return {
                    'data-tip': `${value.date ? value.date.toDateString() : ''} - ${value.count || 0} activities`
                  };
                }}
                showWeekdayLabels
              />
            </div>
            <p style={{ textAlign: 'center', color: 'var(--gray-text)', fontSize: 12, marginTop: 16 }}>Shows content items accessed daily over 52 weeks</p>
          </div>

          {/* Task Score Trend */}
          <div className="student-card" style={{ gridColumn: 'span 2' }}>
            <h2><Target size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Task Performance Trend</h2>
            <div style={{ height: 250, width: '100%', marginTop: 24 }}>
              <ResponsiveContainer>
                <LineChart data={taskScoreData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-dark)' }} />
                  <YAxis domain={[0, 'dataMax + 10']} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Score" stroke="var(--success)" strokeWidth={3} activeDot={{ r: 8 }} />
                  <Line type="dashed" dataKey="Max" stroke="var(--gray-text)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* All Tasks Table */}
          <div className="student-card" style={{ gridColumn: 'span 2' }}>
            <h2>All Task Submissions</h2>
            <div className="data-table-container" style={{ marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task Title</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.task_list || []).map(task => (
                    <tr key={task.id}>
                      <td><span style={{ fontWeight: 500, color: 'var(--navy-bg)' }}>{task.title}</span></td>
                      <td>{new Date(task.due_date).toLocaleDateString()}</td>
                      <td>
                        <span className={`task-status-badge status-${task.status}`}>
                          {task.status.replace('_', ' ')}
                        </span>
                        {task.is_late && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--error)', fontWeight: 600 }}>⚠ Late</span>
                        )}
                      </td>
                      <td>
                        {task.score !== null ? (
                          <span style={{ fontWeight: 600, color: 'var(--success)' }}>{task.score} / {task.max_score}</span>
                        ) : (
                          <span style={{ color: 'var(--gray-text)' }}>Pending</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--gray-text)', fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.feedback || '—'}
                      </td>
                    </tr>
                  ))}
                  {(!data.task_list || data.task_list.length === 0) && (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: 24, color: 'var(--gray-text)' }}>No tasks found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProgressDashboard;
