import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import '../../styles/student-portal.css';

const VideoPlayerPage = () => {
  const { contentId } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState(null);
  const [progress, setProgress] = useState(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const videoRef = useRef(null);
  const iframeRef = useRef(null);

  // Load content metadata and progress
  useEffect(() => {
    const fetchContent = async () => {
      try {
        const cRes = await axiosInstance.get(`/api/student/content/${contentId}`);
        setContent(cRes.data.contentItem);
        
        try {
          const pRes = await axiosInstance.get(`/api/student/content/${contentId}/progress`);
          setProgress(pRes.data);
          if (pRes.data.is_completed) setIsCompleted(true);
        } catch (e) {
          // No progress yet
        }
      } catch (err) {
        console.error('Failed to load video content', err);
      }
    };
    fetchContent();
  }, [contentId]);

  // Set resume position when video is loaded
  const handleTimeUpdate = () => {
    if (!videoRef.current || isCompleted) return;
    const current = videoRef.current.currentTime;
    const duration = videoRef.current.duration;
    if (duration > 0 && (current / duration) > 0.9) {
      setIsCompleted(true);
      submitProgress(current, true);
    }
  };

  const handleLoadedMetadata = () => {
    // Backend returns watch_position_seconds — resume from saved position
    if (videoRef.current && progress?.watch_position_seconds > 0) {
      videoRef.current.currentTime = progress.watch_position_seconds;
    }
  };

  const setSpeed = (speed) => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  };

  // 5s periodic sync
  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        submitProgress(videoRef.current.currentTime, isCompleted);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [contentId, isCompleted]);

  // Backend expects { watch_position_seconds, total_duration_seconds }
  // It calculates completion (>=90%) server-side; we also track it locally.
  const submitProgress = async (time, completed) => {
    try {
      const intDuration = Math.floor(videoRef.current?.duration || 0) || 1;
      const res = await axiosInstance.post(`/api/student/content/${contentId}/progress`, {
        watch_position_seconds:  Math.floor(time),
        total_duration_seconds:  intDuration,
      });
      // Server confirms completion based on the 90% threshold
      if (res.data?.is_completed || completed) setIsCompleted(true);
    } catch (e) {
      console.error('Progress sync failed', e);
    }
  };

  if (!content) return <div style={{ padding: 40 }}>Loading player...</div>;

  const isYouTube = content.external_url?.includes('youtube.com') || content.external_url?.includes('youtu.be');

  // Simple YouTube iframe generation
  const getYouTubeEmbedUrl = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}?enablejsapi=1` : url;
  };

  return (
    <div className="student-portal-layout" style={{ background: 'var(--navy-dark)' }}>
      {/* Player header */}
      <nav className="student-navbar" style={{ background: 'var(--navy-bg)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn-secondary" style={{ padding: '8px 12px', background: 'transparent', color: 'white', border: '1px solid var(--gray-text)' }} onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back
          </button>
          <h2 style={{ color: 'white', margin: 0, fontSize: 18 }}>{content.title}</h2>
        </div>
        <div>
          {isCompleted ? (
            <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle size={18} /> Completed</span>
          ) : (
            <span style={{ color: 'var(--gray-text)', display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={18} /> In Progress</span>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 1000, margin: '40px auto', width: '100%' }}>
        <div className="video-container" style={{ boxShadow: 'var(--glow-shadow)' }}>
          {isYouTube ? (
            <iframe 
              ref={iframeRef}
              src={getYouTubeEmbedUrl(content.external_url)} 
              title="YouTube video player" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen
            ></iframe>
          ) : (
            <video 
              ref={videoRef}
              controls 
              src={content.external_url} 
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
            >
              Your browser does not support HTML5 video.
            </video>
          )}
        </div>

        {!isYouTube && (
          <div className="video-controls" style={{ background: 'var(--navy-light)', border: '1px solid var(--gray-text)' }}>
            <span style={{ color: 'var(--gray-text)' }}>Playback Speed:</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                <button 
                  key={speed} 
                  className="btn-outline" 
                  style={{ padding: '4px 10px', fontSize: 12, borderColor: 'var(--gray-text)', color: 'white' }} 
                  onClick={() => setSpeed(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ color: 'white', marginTop: 24 }}>
          {/* Module description or extra content could go here */}
          <h3 style={{ marginBottom: 12 }}>Description</h3>
          <p style={{ color: 'var(--gray-text)', lineHeight: 1.6 }}>This is the complete video lesson for {content.title}. Please watch until the end closely to ensure your progress is recorded.</p>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerPage;
