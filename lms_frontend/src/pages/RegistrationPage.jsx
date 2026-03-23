import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRegistration } from '../context/RegistrationContext';
import { WizardProgressBar } from './steps/WizardProgressBar';
import { PersonalDetailsStep } from './steps/PersonalDetailsStep';
import { AddressDocumentsStep } from './steps/AddressDocumentsStep';
import { AcademicQualificationsStep } from './steps/AcademicQualificationsStep';
import { CourseBatchStep } from './steps/CourseBatchStep';
import { ReviewSubmitStep } from './steps/ReviewSubmitStep';

export const RegistrationPage = ({ editMode = false }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentStep, loadDraft, resetForm, draftId, isLoading } = useRegistration();

  useEffect(() => {
    // If routing directly to an edit page
    if (editMode && id) {
      if (draftId !== id) {
        loadDraft(id, 'edit');
      }
    } else {
      // If we are starting a fresh registration, ensure state is clear
      if (draftId) {
        resetForm();
      }
    }
  }, [id, editMode]); // Intentionally omitting draftId/resetForm to avoid infinite loops

  const renderActiveStep = () => {
    switch (currentStep) {
      case 1:  return <PersonalDetailsStep />;
      case 2:  return <AddressDocumentsStep />;
      case 3:  return <AcademicQualificationsStep />;
      case 4:  return <CourseBatchStep />;
      case 5:  return <ReviewSubmitStep />;
      default: return <PersonalDetailsStep />;
    }
  };

  return (
    <div className="wizard-container">
      {isLoading && (!draftId && editMode) ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>
          <div className="spinner" style={{ borderTopColor: 'var(--primary-blue)', width: '40px', height: '40px' }}></div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h1 style={{ fontSize: '28px', color: 'var(--navy-bg)', letterSpacing: '-0.5px' }}>
              {editMode ? 'Edit Registration' : 'New Registration'}
            </h1>
            <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '14px' }} onClick={() => navigate('/registrations')}>
              Cancel
            </button>
          </div>
          
          <WizardProgressBar />
          {renderActiveStep()}
        </>
      )}
    </div>
  );
};
