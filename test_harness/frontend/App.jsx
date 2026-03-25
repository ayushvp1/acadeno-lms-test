import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import BatchListPage        from '../../epic8_frontend/pages/hr/BatchListPage';
import CreateBatchPage      from '../../epic8_frontend/pages/hr/CreateBatchPage';
import BatchDetailPage      from '../../epic8_frontend/pages/hr/BatchDetailPage';
import EnrollmentsPage      from '../../epic8_frontend/pages/hr/EnrollmentsPage';
import AuditReportsPage     from '../../epic8_frontend/pages/hr/AuditReportsPage';
import TrainerPoolPage      from '../../epic8_frontend/pages/hr/TrainerPoolPage';
import SystemSettingsPage   from '../../epic8_frontend/pages/admin/SystemSettingsPage';
import AnalyticsDashboardPage from '../../epic8_frontend/pages/admin/AnalyticsDashboardPage';
import '../../epic8_frontend/styles/epic8.css';

/**
 * EPIC-8 TEST HARNESS UI
 */
const App = () => {
    return (
        <BrowserRouter>
            <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
                <aside style={{ width: '280px', background: '#0a192f', padding: '40px 20px', color: 'white' }}>
                    <h2 style={{ marginBottom: '40px', fontSize: '1.5rem', fontWeight: 800 }}>EPIC-8 Test Harness</h2>
                    <nav style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <Link to="/batches" className="sidebar-link">Batches</Link>
                        <Link to="/enrollments" className="sidebar-link">Enrollments</Link>
                        <Link to="/reports" className="sidebar-link">Audit Reports</Link>
                        <Link to="/pools" className="sidebar-link">Faculty & Pools</Link>
                        <hr style={{ opacity: 0.1 }} />
                        <Link to="/settings" className="sidebar-link">System Settings</Link>
                        <Link to="/admin/analytics" className="sidebar-link">Analytics Dashboard</Link>
                    </nav>
                </aside>

                <main style={{ flex: 1 }}>
                    <Routes>
                        <Route path="/batches" element={<BatchListPage />} />
                        <Route path="/batches/new" element={<CreateBatchPage />} />
                        <Route path="/batches/:id" element={<BatchDetailPage />} />
                        <Route path="/enrollments" element={<EnrollmentsPage />} />
                        <Route path="/reports" element={<AuditReportsPage />} />
                        <Route path="/pools" element={<TrainerPoolPage />} />
                        <Route path="/settings" element={<SystemSettingsPage />} />
                        <Route path="/admin/analytics" element={<AnalyticsDashboardPage />} />
                        <Route path="/" element={<div style={{ padding: '80px', textAlign: 'center' }}><h1>Welcome to EPIC-8 Standalone</h1><p>Select a dashboard from the sidebar to test</p></div>} />
                    </Routes>
                </main>
            </div>
            
            <style>{`
                .sidebar-link {
                    padding: 12px 20px; color: rgba(255,255,255,0.7); text-decoration: none; font-weight: 600; font-size: 0.95rem; border-radius: 8px; transition: all 0.2s;
                }
                .sidebar-link:hover { background: rgba(255,255,255,0.05); color: white; }
            `}</style>
        </BrowserRouter>
    );
};

export default App;
