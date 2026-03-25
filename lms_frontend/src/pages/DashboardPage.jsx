import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isBdaArea = user?.role === 'bda' || user?.role === 'super_admin';

  return (
    <div className="dashboard-layout">
      {/* Top Navbar */}
      <nav className="dashboard-nav">
        <div className="nav-brand">ACADENO LMS</div>
        <div className="nav-right">
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
            onClick={() => navigate('/dashboard')}
          >
            {user?.role === 'super_admin' ? 'Executive Overview' : user?.role === 'trainer' ? 'Batch Management' : 'Dashboard'}
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
              <div style={{ margin: '12px 0 4px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '0.05em' }}>Lead Management</div>
              <div 
                className={`sidebar-item ${location.pathname === '/leads/dashboard' ? 'active' : ''}`}
                onClick={() => navigate('/leads/dashboard')}
              >
                Lead Analytics
              </div>
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

          {/* HR Management Section */}
          {(user?.role === 'hr' || user?.role === 'super_admin') && (
            <>
              <div style={{ margin: '16px 0 4px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.6, letterSpacing: '0.05em' }}>HR Management</div>
              <div 
                className={`sidebar-item ${location.pathname === '/admin/analytics' ? 'active' : ''}`}
                onClick={() => navigate('/admin/analytics')}
              >
                HR Overview
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/batches' ? 'active' : ''}`}
                onClick={() => navigate('/hr/batches')}
              >
                Batch Management
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/trainer-pool' ? 'active' : ''}`}
                onClick={() => navigate('/hr/trainer-pool')}
              >
                Trainer Pool
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/enrollments' ? 'active' : ''}`}
                onClick={() => navigate('/hr/enrollments')}
              >
                Student Directory
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/courses' ? 'active' : ''}`}
                onClick={() => navigate('/hr/courses')}
              >
                Course Admin
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/reports' ? 'active' : ''}`}
                onClick={() => navigate('/hr/reports')}
              >
                Audit Reports
              </div>
              <div 
                className={`sidebar-item ${location.pathname === '/hr/student-stats' ? 'active' : ''}`}
                onClick={() => navigate('/hr/student-stats')}
              >
                Student Insights
              </div>
            </>
          )}

          <div style={{ margin: '12px 0 4px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.6 }}>Catalog</div>
          <div 
            className={`sidebar-item ${location.pathname === '/courses' ? 'active' : ''}`}
            onClick={() => navigate('/courses')}
          >
            Course Directory
          </div>

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
              <div style={{ margin: '12px 0 4px 16px', fontSize: '10px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.6 }}>Administration</div>
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
