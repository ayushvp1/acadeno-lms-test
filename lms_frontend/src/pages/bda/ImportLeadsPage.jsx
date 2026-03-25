import React, { useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import '../../styles/leads.css';

const ImportLeadsPage = () => {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError(null);
    setResults(null);
  };

  const handleImport = async () => {
    if (!file) {
      alert('Please select a CSV file first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setImporting(true);
    setError(null);
    setResults(null);

    try {
      const response = await axiosInstance.post('/api/leads/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setResults(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import leads. Check your CSV format.');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent = "name,email,phone,course_interest,source\n" +
                       "John Doe,john@example.com,1234567890,Python Data Science,LinkedIn Ads\n" +
                       "Jane Smith,jane@example.com,0987654321,Full Stack React,Referral";
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'acadeno_leads_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="leads-container">
      <div className="page-header">
        <h1>Bulk Lead Import</h1>
        <button className="btn-link" onClick={downloadTemplate}>Download CSV Template</button>
      </div>

      <div className="detail-card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <p style={{ color: 'var(--gray-text)', marginBottom: '24px' }}>
          Upload a CSV file containing lead information. The headers must match: <code>name, email, phone, course_interest, source</code>.
        </p>

        <div 
          style={{ 
            border: '2px dashed var(--gray-border)', 
            padding: '40px', 
            borderRadius: '12px', 
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            cursor: 'pointer',
            marginBottom: '24px'
          }}
          onClick={() => document.getElementById('fileInput').click()}
        >
          {file ? (
            <div style={{ color: 'var(--navy-bg)', fontWeight: '600' }}>📄 {file.name}</div>
          ) : (
            <div style={{ color: 'var(--gray-text)' }}>Drag and drop or click to select a CSV file</div>
          )}
          <input 
            id="fileInput" type="file" accept=".csv" 
            style={{ display: 'none' }} 
            onChange={handleFileChange} 
          />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <button 
          className="btn-primary" 
          disabled={!file || importing}
          onClick={handleImport}
        >
          {importing ? <div className="spinner"></div> : 'Start Bulk Import'}
        </button>

        {results && (
          <div style={{ marginTop: '40px', animation: 'fadeIn 0.4s ease' }}>
            <h3 style={{ marginBottom: '20px' }}>Import Statistics</h3>
            <div className="stats-grid" style={{ marginBottom: '24px' }}>
              <div className="stat-card">
                <span className="stat-label">Total Processed</span>
                <span className="stat-value">{results.total_rows_processed}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Imported</span>
                <span className="stat-value" style={{ color: 'var(--success)' }}>{results.imported}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label" style={{ color: 'var(--error)' }}>Errors / Skipped</span>
                <span className="stat-value" style={{ color: 'var(--error)' }}>
                  {results.errors.length + results.skipped.length}
                </span>
              </div>
            </div>

            {results.skipped.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ color: 'var(--gray-text)' }}>Skipped Duplicates</h4>
                <div className="leads-table-container">
                  <table className="leads-table">
                    <thead><tr><th>Row</th><th>Email</th><th>Reason</th></tr></thead>
                    <tbody>
                      {results.skipped.map((s, idx) => (
                        <tr key={idx}><td>{s.row}</td><td>{s.email}</td><td>{s.reason}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {results.errors.length > 0 && (
              <div>
                <h4 style={{ color: 'var(--error)' }}>Validation Errors</h4>
                <div className="leads-table-container">
                  <table className="leads-table">
                    <thead><tr><th>Row</th><th>Reason</th></tr></thead>
                    <tbody>
                      {results.errors.map((e, idx) => (
                        <tr key={idx}><td style={{ color: 'var(--error)' }}>{e.row}</td><td>{e.reason}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportLeadsPage;
