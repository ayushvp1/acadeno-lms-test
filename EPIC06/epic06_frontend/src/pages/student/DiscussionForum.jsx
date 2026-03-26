import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ArrowLeft, Send, LogOut, ClipboardList, BarChart2 } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';
import '../../styles/student-portal.css';

const DiscussionForum = () => {
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [modules, setModules] = useState([]);
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [replies, setReplies] = useState([]);
  
  // Forms
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostBody, setNewPostBody] = useState('');
  const [newReplyBody, setNewReplyBody] = useState('');
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      try {
        const dRes = await axiosInstance.get('/api/student/dashboard');
        setData(dRes.data);
        const mRes = await axiosInstance.get(`/api/student/courses/${dRes.data.course_id}/content`);
        setModules(mRes.data.modules || []);
        if (mRes.data.modules?.length > 0) {
          fetchPosts(mRes.data.modules[0].id);
        }
      } catch (err) {
        console.error('Failed to init discussions', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const fetchPosts = async (moduleId) => {
    setSelectedModuleId(moduleId);
    setSelectedPost(null);
    try {
      const res = await axiosInstance.get(`/api/discussions?module_id=${moduleId}`);
      setPosts(res.data.posts || []);
    } catch (err) {
      console.error('Failed to fetch posts', err);
    }
  };

  const loadPostThread = async (post) => {
    setSelectedPost(post);
    try {
      const res = await axiosInstance.get(`/api/discussions/${post.id}/replies`);
      setReplies(res.data.replies || []);
    } catch (err) {
      console.error('Failed to load thread', err);
    }
  };

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newPostTitle || !newPostBody || !selectedModuleId) return;
    try {
      await axiosInstance.post('/api/discussions', {
        module_id: selectedModuleId,
        title: newPostTitle,
        body: newPostBody
      });
      setNewPostTitle('');
      setNewPostBody('');
      fetchPosts(selectedModuleId);
    } catch (err) {
      console.error('Create post failed', err);
    }
  };

  const handleCreateReply = async (e) => {
    e.preventDefault();
    if (!newReplyBody || !selectedPost) return;
    try {
      await axiosInstance.post(`/api/discussions/${selectedPost.id}/replies`, {
        body: newReplyBody
      });
      setNewReplyBody('');
      loadPostThread(selectedPost);
    } catch (err) {
      console.error('Create reply failed', err);
    }
  };

  if (loading) return <div style={{ padding: 40 }}>Loading forum...</div>;

  return (
    <div className="student-portal-layout">
      {/* Top Navbar */}
      <nav className="student-navbar">
        <div className="student-nav-brand" onClick={() => navigate('/student/dashboard')}>Acadeno LMS</div>
        <div className="student-nav-links">
          <span className="student-nav-link" onClick={() => navigate('/student/dashboard')}>Dashboard</span>
          <span className="student-nav-link" onClick={() => navigate('/student/tasks')}>
            <ClipboardList size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Tasks
          </span>
          <span className="student-nav-link" onClick={() => navigate('/student/progress')}>
            <BarChart2 size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Progress
          </span>
          <span className="student-nav-link active">
            <MessageSquare size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Discussions
          </span>
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
        <h1 style={{ marginBottom: 24, color: 'var(--navy-bg)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <MessageSquare size={24} /> Discussion Forum
        </h1>
        
        <div className="course-layout">
          {/* Main List Area */}
          {!selectedPost ? (
             <div style={{ flex: 1, display: 'flex', gap: 24, flexDirection: 'column' }}>
               <div className="student-card" style={{ padding: 16 }}>
                 <label style={{ marginRight: 16, fontWeight: 600 }}>Filter by Module:</label>
                 <select 
                   className="auth-input" 
                   style={{ width: 300, display: 'inline-block' }}
                   value={selectedModuleId}
                   onChange={(e) => fetchPosts(e.target.value)}
                 >
                   {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                   {modules.length === 0 && <option value="">No modules available</option>}
                 </select>
               </div>

               <div style={{ display: 'flex', gap: 24 }}>
                 {/* Post List */}
                 <div style={{ flex: 2 }}>
                   {posts.map(post => (
                     <div key={post.id} className="discussion-post student-card" onClick={() => loadPostThread(post)}>
                       <h3 style={{ marginBottom: 8 }}>{post.title}</h3>
                       <p style={{ color: 'var(--gray-text)', fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                         {post.body}
                       </p>
                       <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--gray-text)' }}>
                         <span>{post.author_name} • {new Date(post.created_at).toLocaleString()}</span>
                         <span>{post.reply_count || 0} replies {post.has_trainer_reply ? '✅' : ''}</span>
                       </div>
                     </div>
                   ))}
                   {posts.length === 0 && <div className="student-card" style={{ color: 'var(--gray-text)' }}>No discussions in this module yet. Be the first!</div>}
                 </div>

                 {/* New Post Form */}
                 <div style={{ flex: 1 }}>
                   <div className="student-card">
                     <h3 style={{ marginBottom: 16, borderBottom: '1px solid var(--gray-border)', paddingBottom: 8 }}>Start a New Thread</h3>
                     <form onSubmit={handleCreatePost} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                       <input 
                         type="text" 
                         placeholder="Subject Line" 
                         className="auth-input" 
                         value={newPostTitle} 
                         onChange={e => setNewPostTitle(e.target.value)} 
                         required 
                       />
                       <textarea 
                         placeholder="What's your question or insight?" 
                         className="auth-input" 
                         style={{ minHeight: 120, resize: 'vertical' }}
                         value={newPostBody}
                         onChange={e => setNewPostBody(e.target.value)}
                         required
                       />
                       <button type="submit" className="btn-primary">Post Discussion</button>
                     </form>
                   </div>
                 </div>
               </div>
             </div>
          ) : (
            /* Thread View Area */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 16 }}>
                <button className="btn-secondary" style={{ padding: '6px 16px', background: 'transparent' }} onClick={() => setSelectedPost(null)}>
                  <ArrowLeft size={16} /> Back to questions
                </button>
              </div>

              <div className="student-card" style={{ background: 'var(--navy-bg)', color: 'white' }}>
                <h2 style={{ color: 'white', borderBottomColor: 'rgba(255,255,255,0.2)' }}>{selectedPost.title}</h2>
                <div style={{ fontSize: 13, marginBottom: 16, color: 'rgba(255,255,255,0.7)' }}>Posted by {selectedPost.author_name} on {new Date(selectedPost.created_at).toLocaleString()}</div>
                <p style={{ lineHeight: 1.6 }}>{selectedPost.body}</p>
              </div>

              <h3 style={{ margin: '24px 0 16px 8px' }}>Replies ({replies.length})</h3>
              
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {replies.map(reply => (
                  <div key={reply.id} className="student-card reply-block" style={{ borderLeftColor: reply.user_role === 'trainer' ? 'var(--primary-blue)' : 'var(--gray-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13, color: 'var(--gray-text)' }}>
                      <span style={{ fontWeight: 600, color: reply.user_role === 'trainer' ? 'var(--primary-blue)' : 'var(--text-dark)' }}>
                        {reply.author_name} {reply.user_role === 'trainer' && '(Trainer)'}
                      </span>
                      <span>{new Date(reply.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ lineHeight: 1.5, fontSize: 14 }}>{reply.body}</p>
                  </div>
                ))}
                {replies.length === 0 && <div style={{ color: 'var(--gray-text)', marginLeft: 8 }}>No replies yet.</div>}
              </div>

              {/* Reply Box */}
              <div className="student-card" style={{ marginTop: 24 }}>
                <form onSubmit={handleCreateReply} style={{ display: 'flex', gap: 12 }}>
                  <textarea 
                    className="auth-input" 
                    placeholder="Write a reply..." 
                    style={{ flex: 1, minHeight: 80, resize: 'none' }}
                    value={newReplyBody}
                    onChange={e => setNewReplyBody(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn-primary" style={{ width: 120 }}>
                    <Send size={16} /> Reply
                  </button>
                </form>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscussionForum;
