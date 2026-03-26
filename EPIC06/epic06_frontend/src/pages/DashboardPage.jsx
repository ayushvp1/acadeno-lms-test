import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Bell, X, ExternalLink, Calendar } from 'lucide-react';
import axiosInstance from '../api/axiosInstance';

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [notifications, setNotifications] = React.useState([]);
  const [showNotifications, setShowNotifications] = React.useState(false);

  const isBdaArea = user?.role === 'bda' || user?.role === 'super_admin';

  React.useEffect(() => {
    const fetchUnread = async () => {
      try {
        const res = await axiosInstance.get('/api/student/notifications/count');
        setUnreadCount(res.data?.unread_count || 0);
      } catch (_) {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await axiosInstance.get('/api/student/notifications');
      setNotifications(res.data.notifications || []);
    } catch (_) {}
  };

  const handleToggleNotifications = () => {
    if (!showNotifications) fetchNotifications();
    setShowNotifications(!showNotifications);
  };

  const markRead = async (id, refId, type) => {
    try {
      await axiosInstance.patch(`/api/student/notifications/${id}/read`);
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.filter(n => n.id !== id));
      
      // Navigate based on type
      if (type === 'batch_assigned' && refId) {
        if (user.role === 'trainer') navigate(`/trainer/batch/${refId}/dashboard`);
        else navigate(`/batches/${refId}`);
      }
    } catch (_) {}
  };

  return (
    <div className="dashboard-layout">
      {/* Top Navbar */}
      <nav className="dashboard-nav">
        <div className="nav-brand">ACADENO LMS</div>
        <div className="nav-right">
          {/* Notification Bell */}
          <div style={{ position: 'relative', marginRight: '16px' }}>
            <button 
              onClick={handleToggleNotifications}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-5px', right: '-5px',
                  background: '#ef4444', color: 'white', borderRadius: '50%',
                  width: '16px', height: '16px', fontSize: '10px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="notifications-dropdown" style={{
                position: 'absolute', top: '40px', right: '0',
                width: '320px', background: 'white', border: '1px solid #e2e8f0',
                borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                zIndex: 1000, padding: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}>Recent Alerts</h4>
                  <button onClick={() => setShowNotifications(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                    <X size={16} />
                  </button>
                </div>
                
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', padding: '20px' }}>No new notifications</p>
                  ) : (
                    notifications.map(n => (
                      <div 
                        key={n.id} 
                        onClick={() => markRead(n.id, n.reference_id, n.type)}
                        style={{
                          padding: '12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {n.title}
                          <ExternalLink size={12} color="#2563eb" />
                        </div>
                        <p style={{ fontSize: '12px', color: '#64748b', margin: 0, lineHeight: 1.4 }}>{n.body}</p>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="user-info">
            <span style={{ fontWeight: 500 }}>{user?.email}</span>
            <span className="role-badge">{user?.role}</span>
          </div>
          <button onClick={logout} className="btn-primary" style={{ minHeight: '36px', padding: '0 16px', fontSize: '13px', width: 'auto' }}>
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-body">
        {/* Sidebar */}
        <aside className="dashboard-sidebar">
          <div 
            className={`sidebar-item ${location.pathname === '/dashboard' ? 'active' : ''}`}
            onClick={() => {
              if (user?.role === 'super_admin') navigate('/admin/analytics');
              else if (user?.role === 'hr') navigate('/hr/enrollments');
              else if (user?.role === 'trainer') navigate('/trainer/dashboard');
              else navigate('/dashboard');
            }}
          >
            {user?.role === 'student' ? 'Dashboard' : 'Command Center'}
          </div>

          {(user?.role === 'hr' || user?.role === 'bda' || user?.role === 'super_admin') && (
            <div 
              className={`sidebar-item ${location.pathname === '/registrations' ? 'active' : ''}`}
              onClick={() => navigate('/registrations')}
            >
              Registrations
            </div>
          )}

          {isBdaArea && (
            <>
              <div style={{ margin: '16px 0 8px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.7 }}>Lead Management</div>
              <div 
                className={`sidebar-item ${location.pathname === '/leads' ? 'active' : ''}`}
                onClick={() => navigate('/leads')}
              >
                All Leads
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/leads/import' ? 'active' : ''}`}
                onClick={() => navigate('/leads/import')}
              >
                Bulk Import
              </div>
            </>
          )}

          <div style={{ margin: '16px 0 8px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.7 }}>Acadeno Learning</div>
          
          <div 
            className={`sidebar-item ${location.pathname === '/courses' ? 'active' : ''}`}
            onClick={() => navigate('/courses')}
          >
            Course Directory
          </div>

          {(user?.role === 'hr' || user?.role === 'super_admin') && (
            <>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/courses' ? 'active' : ''}`}
                onClick={() => navigate('/hr/courses')}
              >
                Course Admin
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/enrollments' ? 'active' : ''}`}
                onClick={() => navigate('/hr/enrollments')}
              >
                Enrollments
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/trainers' ? 'active' : ''}`}
                onClick={() => navigate('/hr/trainers')}
              >
                Trainer Pool
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/reports' ? 'active' : ''}`}
                onClick={() => navigate('/hr/reports')}
              >
                Audit Reports
              </div>
            </>
          )}
          {user?.role === 'trainer' && (
            <>
              <div 
                className={`sidebar-item ${location.pathname === '/trainer/tasks' ? 'active' : ''}`}
                onClick={() => navigate('/trainer/tasks')}
              >
                Task Manager
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/student-stats' ? 'active' : ''}`}
                onClick={() => navigate('/hr/student-stats')}
              >
                Student Insights
              </div>
            </>
          )}
          
          {user?.role === 'super_admin' && (
            <>
              <div style={{ margin: '16px 0 8px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.7 }}>Administration</div>
              <div 
                className={`sidebar-item ${location.pathname === '/admin/analytics' ? 'active' : ''}`}
                onClick={() => navigate('/admin/analytics')}
              >
                System Analytics
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/batches' ? 'active' : ''}`}
                onClick={() => navigate('/batches')}
              >
                Batch Management
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/admin/settings' ? 'active' : ''}`}
                onClick={() => navigate('/admin/settings')}
              >
                System Settings
              </div>
            </>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="dashboard-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;
