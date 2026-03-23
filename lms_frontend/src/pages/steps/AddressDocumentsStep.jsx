import React, { useState, useEffect } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { registrationApi } from '../../api/registrationApi';

export const AddressDocumentsStep = () => {
  const { formData, saveStep, mode, isLoading, error: contextError } = useRegistration();
  
  const [localData, setLocalData] = useState({
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pin_code: '',
    aadhaar_number: '',
    pan_number: '',
  });

  const [pinError, setPinError] = useState(null);
  const [isAdult, setIsAdult] = useState(false);

  useEffect(() => {
    // Check if user is an adult based on step 1 data
    if (formData.personal_details?.date_of_birth) {
      const today = new Date();
      const birthDate = new Date(formData.personal_details.date_of_birth);
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      setIsAdult(age >= 18);
    }

    if (formData.address_documents) {
      setLocalData({
        address_line1: formData.address_documents.address_line1 || '',
        address_line2: formData.address_documents.address_line2 || '',
        city: formData.address_documents.city || '',
        state: formData.address_documents.state || '',
        pin_code: formData.address_documents.pin_code || '',
        aadhaar_number: formData.address_documents.aadhaar_number || '',
        pan_number: formData.address_documents.pan_number || '',
      });
    }
  }, [formData]);

  const handlePinBlur = async (e) => {
    const pin = e.target.value;
    if (pin.length === 6) {
      setPinError(null);
      try {
        const res = await registrationApi.lookupPinCode(pin);
        if (res.fallback) {
          setPinError(res.message);
        } else {
          setLocalData(prev => ({
            ...prev,
            city: res.city || prev.city,
            state: res.state || prev.state
          }));
        }
      } catch (err) {
        setPinError('Address auto-fill unavailable. Please enter city and state manually.');
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLocalData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await saveStep(2, 'address_documents', localData);
  };

  const isViewOnly = mode === 'view';

  return (
    <div className="step-card">
      <div className="step-header">
        <h2 className="step-title">Address & Identity</h2>
        <p className="step-subtitle">Provide address location and valid ID documents.</p>
      </div>

      {contextError && <div className="alert alert-error">{contextError}</div>}
      {pinError && <div className="alert alert-error">{pinError}</div>}

      <form onSubmit={handleSubmit} className="form-grid">
        <div className="input-group full-width">
          <label>Address Line 1 *</label>
          <input 
            type="text" 
            name="address_line1" 
            className="auth-input" 
            value={localData.address_line1} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required 
          />
        </div>

        <div className="input-group full-width">
          <label>Address Line 2 (Optional)</label>
          <input 
            type="text" 
            name="address_line2" 
            className="auth-input" 
            value={localData.address_line2} 
            onChange={handleChange} 
            disabled={isViewOnly}
          />
        </div>

        <div className="input-group">
          <label>PIN Code * (6 Digits)</label>
          <input 
            type="text" 
            name="pin_code" 
            className="auth-input" 
            value={localData.pin_code} 
            onChange={handleChange} 
            onBlur={handlePinBlur}
            disabled={isViewOnly}
            maxLength="6"
            pattern="\d{6}"
            title="Must be a 6 digit number"
            required 
          />
        </div>

        <div className="input-group"></div> {/* Spacer */}

        <div className="input-group">
          <label>City *</label>
          <input 
            type="text" 
            name="city" 
            className="auth-input" 
            value={localData.city} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required 
          />
        </div>

        <div className="input-group">
          <label>State *</label>
          <input 
            type="text" 
            name="state" 
            className="auth-input" 
            value={localData.state} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required 
          />
        </div>

        <div className="full-width" style={{ marginTop: '20px' }}>
          <h3 className="step-subtitle" style={{ color: 'var(--text-dark)', fontWeight: 600 }}>Identity Documents</h3>
          {isAdult && <p style={{ fontSize: '13px', color: 'var(--error)', marginTop: '4px' }}>Adult student (18+). Aadhaar OR PAN is mandatory.</p>}
        </div>

        <div className="input-group">
          <label>Aadhaar Number</label>
          <input 
            type="text" 
            name="aadhaar_number" 
            className="auth-input" 
            value={localData.aadhaar_number} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required={isAdult && !localData.pan_number}
          />
        </div>

        <div className="input-group">
          <label>PAN Number</label>
          <input 
            type="text" 
            name="pan_number" 
            className="auth-input" 
            value={localData.pan_number} 
            onChange={handleChange} 
            disabled={isViewOnly}
            required={isAdult && !localData.aadhaar_number}
          />
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
