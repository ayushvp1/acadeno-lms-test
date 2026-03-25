import React, { useState, useEffect } from 'react';
import { useRegistration } from '../../context/RegistrationContext';

export const PersonalDetailsStep = () => {
  const { formData, saveStep, mode, isLoading, error } = useRegistration();
  
  const [localData, setLocalData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: 'male',
    phone: '',
    email: '',
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
  });
  
  const [photoFile, setPhotoFile] = useState(null);
  const [isMinor, setIsMinor] = useState(false);

  useEffect(() => {
    if (formData.personal_details) {
      setLocalData({
        first_name: formData.personal_details.first_name || '',
        last_name: formData.personal_details.last_name || '',
        date_of_birth: formData.personal_details.date_of_birth ? formData.personal_details.date_of_birth.split('T')[0] : '',
        gender: formData.personal_details.gender || 'male',
        phone: formData.personal_details.phone || '',
        email: formData.personal_details.email || '',
        emergency_contact_name: formData.personal_details.emergency_contact_name || '',
        emergency_contact_relationship: formData.personal_details.emergency_contact_relationship || '',
        emergency_contact_phone: formData.personal_details.emergency_contact_phone || '',
      });
      calculateAgeCategory(formData.personal_details.date_of_birth);
    }
  }, [formData.personal_details]);

  const calculateAgeCategory = (dobString) => {
    if (!dobString) {
      setIsMinor(false);
      return;
    }
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    setIsMinor(age < 18);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLocalData(prev => ({ ...prev, [name]: value }));
    
    if (name === 'date_of_birth') {
      calculateAgeCategory(value);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Convert to FormData if there's a file
    let payload = localData;
    let isFormData = false;
    
    if (photoFile) {
      payload = new FormData();
      Object.keys(localData).forEach(key => {
        if (localData[key]) payload.append(key, localData[key]);
      });
      payload.append('profile_photo', photoFile);
      isFormData = true;
    }

    await saveStep(1, 'personal_details', payload, isFormData);
  };

  const isViewOnly = mode === 'view';

  return (
    <div className="step-card">
      <div className="step-header">
        <h2 className="step-title">Personal Details</h2>
        <p className="step-subtitle">Enter student's core information and emergency contacts.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form-grid">
        <div className="input-group">
          <label>First Name *</label>
          <input 
            type="text" 
            name="first_name" 
            className="auth-input" 
            value={localData.first_name} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required 
          />
        </div>
        
        <div className="input-group">
          <label>Last Name</label>
          <input 
            type="text" 
            name="last_name" 
            className="auth-input" 
            value={localData.last_name} 
            onChange={handleChange} 
            disabled={isViewOnly}
          />
        </div>

        <div className="input-group">
          <label>Email *</label>
          <input 
            type="email" 
            name="email" 
            className="auth-input" 
            value={localData.email} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required 
          />
        </div>

        <div className="input-group">
          <label>Phone *</label>
          <input 
            type="tel" 
            name="phone" 
            className="auth-input" 
            value={localData.phone} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required 
          />
        </div>

        <div className="input-group">
          <label>Date of Birth * (Min 16 years)</label>
          <input 
            type="date" 
            name="date_of_birth" 
            className="auth-input" 
            value={localData.date_of_birth} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required 
          />
        </div>

        <div className="input-group">
          <label>Gender *</label>
          <select 
            name="gender" 
            className="auth-input" 
            value={localData.gender} 
            onChange={handleChange}
            disabled={isViewOnly}
            required
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="input-group full-width">
          <label>Profile Photo</label>
          {!isViewOnly ? (
            <input 
              type="file" 
              accept="image/*" 
              className="auth-input" 
              onChange={handleFileChange} 
            />
          ) : (
            <p className="auth-input" style={{ backgroundColor: '#f3f4f6' }}>
              {formData.personal_details?.profile_photo_path ? 'Photo uploaded' : 'No photo'}
            </p>
          )}
        </div>

        {isMinor && (
          <>
            <div className="full-width" style={{ marginTop: '10px' }}>
              <div className="alert alert-error" style={{ marginBottom: 0 }}>
                Student is under 18. Emergency contact details are mandatory.
              </div>
            </div>
            
            <div className="input-group">
              <label>Emergency Contact Name *</label>
              <input 
                type="text" 
                name="emergency_contact_name" 
                className="auth-input" 
                value={localData.emergency_contact_name} 
                onChange={handleChange} 
                disabled={isViewOnly}
                required={isMinor} 
              />
            </div>
            
            <div className="input-group">
              <label>Relationship *</label>
              <input 
                type="text" 
                name="emergency_contact_relationship" 
                className="auth-input" 
                value={localData.emergency_contact_relationship} 
                onChange={handleChange} 
                disabled={isViewOnly}
                required={isMinor} 
              />
            </div>

            <div className="input-group">
              <label>Emergency Contact Phone *</label>
              <input 
                type="tel" 
                name="emergency_contact_phone" 
                className="auth-input" 
                value={localData.emergency_contact_phone} 
                onChange={handleChange} 
                disabled={isViewOnly}
                required={isMinor} 
              />
            </div>
          </>
        )}

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
