import React from 'react';
import { useAuth } from '../context/AuthContext';

const DashboardPage = () => {
  const { user, logout } = useAuth();

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
          <div className="sidebar-item active">
            Dashboard
          </div>
          {(user?.role === 'hr' || user?.role === 'bda' || user?.role === 'super_admin') && (
            <div className="sidebar-item" onClick={() => window.location.href = '/registrations'}>
              Registrations
            </div>
          )}
          <div className="sidebar-item">Courses</div>
          <div className="sidebar-item">Assignments</div>
          
          {user?.role === 'super_admin' && (
            <>
              <div style={{ margin: '16px 0 8px 16px', fontSize: '11px', fontWeight: 600, color: 'var(--gray-border)', textTransform: 'uppercase' }}>Administration</div>
              <div className="sidebar-item">Users</div>
              <div className="sidebar-item">System Settings</div>
            </>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="dashboard-content">
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
        </main>
      </div>
    </div>
  );
};

export default DashboardPage;
