import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle, Lock, PlayCircle, FileText,
  ChevronDown, ChevronRight, BookOpen, LogOut, Download,
} from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import '../../styles/student-portal.css';

const CourseContentPage = () => {
  const { courseId } = useParams();
  const navigate     = useNavigate();
  const { logout }   = useAuth();
  const [arrModules, setArrModules] = useState([]);
  const [boolLoading, setBoolLoading] = useState(true);
  const [objExpanded, setObjExpanded] = useState({});
  const [strError, setStrError] = useState(null);

  useEffect(() => {
    if (!courseId || courseId === 'undefined') {
      setStrError('No course selected. Please go back to your dashboard.');
      setBoolLoading(false);
      return;
    }
    const fetchContent = async () => {
      try {
        const res = await axiosInstance.get(`/api/student/courses/${courseId}/content`);
        const arrMods = res.data.modules || [];
        setArrModules(arrMods);
        // Expand all modules by default
        const objInit = {};
        arrMods.forEach(m => { objInit[m.id] = true; });
        setObjExpanded(objInit);
      } catch (err) {
        console.error('Failed to load course content', err);
        setStrError('Failed to load course content. Please try again.');
      } finally {
        setBoolLoading(false);
      }
    };
    fetchContent();
  }, [courseId]);

  const toggleModule = (strId) => setObjExpanded(prev => ({ ...prev, [strId]: !prev[strId] }));

  const handleItemClick = (objItem) => {
    if (!objItem.is_published) return;
    if (objItem.content_type === 'video') {
      navigate(`/student/content/${objItem.id}/watch`);
    } else if (objItem.external_url) {
      window.open(objItem.external_url, '_blank');
    }
  };

  if (boolLoading) return (
    <div className="student-portal-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ padding: 40, color: 'var(--primary-blue)' }}>Loading syllabus…</div>
    </div>
  );

  return (
    <div className="student-portal-layout">
      {/* ── Navbar ── */}
      <nav className="student-navbar">
        <div className="student-nav-brand" onClick={() => navigate('/student/dashboard')}>Acadeno LMS</div>
        <div className="student-nav-links">
          <span className="student-nav-link" onClick={() => navigate('/student/dashboard')}>Dashboard</span>
          <span className="student-nav-link active">Course</span>
          <span className="student-nav-link" onClick={() => navigate('/student/tasks')}>Tasks</span>
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
        <h1 style={{ marginBottom: 24, color: 'var(--navy-bg)' }}>Course Content</h1>

        {strError && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '16px 20px', marginBottom: 24, color: '#991b1b' }}>
            {strError}
          </div>
        )}

        {!strError && (
          <div className="course-layout">
            {/* ── Sidebar: Module List ── */}
            <div className="course-sidebar">
              {arrModules.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--gray-text)' }}>No published modules found for this course.</p>
              ) : (
                arrModules.map(objModule => (
                  <div key={objModule.id}>
                    <div className="module-header" onClick={() => toggleModule(objModule.id)}>
                      <div>
                        <div style={{ fontSize: 14 }}>{objModule.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray-text)', fontWeight: 'normal', marginTop: 2 }}>
                          {objModule.items?.filter(i => i.is_completed).length || 0} / {objModule.items?.length || 0} completed
                        </div>
                      </div>
                      {objExpanded[objModule.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>

                    {objExpanded[objModule.id] && (
                      <div className="module-items">
                        {(objModule.items || []).length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--gray-text)', padding: '8px 10px' }}>
                            No items published in this module yet.
                          </div>
                        ) : (
                          (objModule.items || []).map(objItem => (
                            <div
                              key={objItem.id}
                              className={`content-item ${!objItem.is_published ? 'locked' : ''}`}
                              onClick={() => handleItemClick(objItem)}
                            >
                              {objItem.is_completed ? (
                                <CheckCircle size={16} className="icon-check" />
                              ) : !objItem.is_published ? (
                                <Lock size={16} color="var(--gray-text)" />
                              ) : objItem.content_type === 'video' ? (
                                <PlayCircle size={16} color="var(--primary-blue)" />
                              ) : (
                                <FileText size={16} color="var(--gray-text)" />
                              )}
                              <span style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {objItem.title}
                              </span>
                              {objItem.is_downloadable && objItem.external_url && (
                                <a
                                  href={objItem.external_url}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: 'var(--primary-blue)', flexShrink: 0, lineHeight: 0 }}
                                  onClick={e => e.stopPropagation()}
                                  title="Download"
                                >
                                  <Download size={14} />
                                </a>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* ── Main Area: Prompt to select ── */}
            <div className="course-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gray-light)' }}>
              <div style={{ textAlign: 'center', color: 'var(--gray-text)' }}>
                <BookOpen size={48} style={{ opacity: 0.4, marginBottom: 16 }} />
                <h3 style={{ marginBottom: 8 }}>Select a topic from the sidebar</h3>
                <p style={{ fontSize: 14 }}>Your learning material will appear here.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseContentPage;
