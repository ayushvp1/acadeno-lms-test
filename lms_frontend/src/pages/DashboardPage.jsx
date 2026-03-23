import React from 'react';
import { useAuth } from '../context/AuthContext';
<<<<<<< HEAD
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const DashboardPage = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isBdaArea = user?.role === 'bda' || user?.role === 'super_admin';
=======

const DashboardPage = () => {
  const { user, logout } = useAuth();
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906

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
<<<<<<< HEAD
          <div 
            className={`sidebar-item ${location.pathname === '/dashboard' ? 'active' : ''}`}
            onClick={() => navigate('/dashboard')}
          >
            {user?.role === 'super_admin' || user?.role === 'trainer' ? 'Batch Management' : 'Dashboard'}
          </div>

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

          <div style={{ margin: '16px 0 8px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.7 }}>Learning</div>
=======
          <div className="sidebar-item active">
            Dashboard
          </div>
          {(user?.role === 'hr' || user?.role === 'bda' || user?.role === 'super_admin') && (
            <div className="sidebar-item" onClick={() => window.location.href = '/registrations'}>
              Registrations
            </div>
          )}
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
          <div className="sidebar-item">Courses</div>
          <div className="sidebar-item">Assignments</div>
          
          {user?.role === 'super_admin' && (
            <>
<<<<<<< HEAD
              <div style={{ margin: '16px 0 8px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--gray-text)', textTransform: 'uppercase', opacity: 0.7 }}>Administration</div>
=======
              <div style={{ margin: '16px 0 8px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--gray-border)', textTransform: 'uppercase' }}>Administration</div>
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
              <div className="sidebar-item">Users</div>
              <div className="sidebar-item">System Settings</div>
            </>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="dashboard-content">
<<<<<<< HEAD
          <Outlet />
=======
          <div className="welcome-widget">
            <h1>Welcome back! 👋</h1>
            <p>
              Your current session is active. You have been granted the <strong>{user?.role}</strong> role.
              The sidebar on the left will expand as more microservices map to your specific access level inside the platform ecosystem.
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
             {/* Example Card */}
             <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
               <h3 style={{ marginBottom: '8px', color: 'var(--navy-bg)' }}>Active Module</h3>
               <p style={{ color: 'var(--gray-text)', fontSize: '14px' }}>The EPIC-01 Authentication phase is securely managing this environment state.</p>
             </div>
          </div>
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;
