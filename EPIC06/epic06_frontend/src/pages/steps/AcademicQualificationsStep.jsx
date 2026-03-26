import React, { useState, useEffect } from 'react';
import { useRegistration } from '../../context/RegistrationContext';

export const AcademicQualificationsStep = () => {
  const { formData, saveStep, mode, isLoading, error } = useRegistration();
  
  const [localData, setLocalData] = useState({
    qualification: '',
    institution: '',
    year_of_passing: '',
    score: '',
  });
  
  const [marksheetFile, setMarksheetFile] = useState(null);

  useEffect(() => {
    if (formData.academic) {
      setLocalData({
        qualification: formData.academic.qualification || '',
        institution:   formData.academic.institution || '',
        year_of_passing: formData.academic.year_of_passing || '',
        score:         formData.academic.score || '',
      });
    }
  }, [formData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLocalData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setMarksheetFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let isFormData = false;
    let payload = { ...localData };
    
    if (marksheetFile) {
      payload = new FormData();
      Object.keys(localData).forEach(key => {
        if (localData[key]) payload.append(key, localData[key]);
      });
      payload.append('marksheet', marksheetFile);
      isFormData = true;
    }

    await saveStep(3, 'academic', payload, isFormData);
  };

  const isViewOnly = mode === 'view';
  const currentYear = new Date().getFullYear();

  return (
    <div className="step-card">
      <div className="step-header">
        <h2 className="step-title">Academic Qualifications</h2>
        <p className="step-subtitle">Provide details of your highest level of education.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form-grid">
        <div className="input-group">
          <label>Highest Qualification *</label>
          <select 
            name="qualification" 
            className="auth-input" 
            value={localData.qualification} 
            onChange={handleChange}
            disabled={isViewOnly}
            required
          >
            <option value="" disabled>Select Qualification</option>
            <option value="10th">10th Standard</option>
            <option value="12th">12th Standard</option>
            <option value="Bachelor's Degree">Bachelor's Degree</option>
            <option value="Master's Degree">Master's Degree</option>
            <option value="Diploma">Diploma</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div className="input-group">
          <label>Institution / University *</label>
          <input 
            type="text" 
            name="institution" 
            className="auth-input" 
            value={localData.institution} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required 
          />
        </div>

        <div className="input-group">
          <label>Year of Passing * (Max: {currentYear})</label>
          <input 
            type="number" 
            name="year_of_passing" 
            className="auth-input" 
            value={localData.year_of_passing} 
            onChange={handleChange} 
            disabled={isViewOnly}
            min="1980"
            max={currentYear}
            required 
          />
        </div>

        <div className="input-group">
          <label>Score / Percentage / CGPA</label>
          <input 
            type="text" 
            name="score" 
            className="auth-input" 
            value={localData.score} 
            onChange={handleChange} 
            disabled={isViewOnly}
            placeholder="e.g. 85% or 8.5 CGPA"
          />
        </div>

        <div className="input-group full-width">
          <label>Upload Marksheet (PDF max 10MB)</label>
          {!isViewOnly ? (
            <input 
              type="file" 
              accept=".pdf,application/pdf" 
              className="auth-input" 
              onChange={handleFileChange} 
            />
          ) : (
            <p className="auth-input" style={{ backgroundColor: '#f3f4f6' }}>
              {formData.academic?.marksheet_path ? 'PDF Marksheet saved' : 'No marksheet attached'}
            </p>
          )}
        </div>

        {!isViewOnly && (
          <div className="wizard-actions full-width" style={{ justifyContent: 'flex-end' }}>
            <button type="submit" className="btn-primary" disabled={isLoading} style={{ width: 'auto', padding: '12px 32px' }}>
              {isLoading ? <div className="spinner"></div> : 'Save & Continue'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
