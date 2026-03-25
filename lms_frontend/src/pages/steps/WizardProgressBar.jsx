import React from 'react';
import { useRegistration } from '../../context/RegistrationContext';

const STEPS = [
  'Personal Details',
  'Address & Identity',
  'Academic',
  'Course & Batch',
  'Review & Submit'
];

export const WizardProgressBar = () => {
  const { currentStep, highestStep, setCurrentStep, mode } = useRegistration();

  const handleStepClick = (index) => {
    const stepNum = index + 1;
    // Allow clicking if it's already completed or if we are in view/edit mode
    if (stepNum <= highestStep || mode !== 'create') {
      setCurrentStep(stepNum);
    }
  };

  return (
    <div className="wizard-progress">
      {STEPS.map((stepName, index) => {
        const stepNum = index + 1;
        const isActive = currentStep === stepNum;
        const isCompleted = stepNum < currentStep || (mode !== 'create' && stepNum !== currentStep);
        // Only allow clicking steps that are accessible
        const isClickable = stepNum <= highestStep || mode !== 'create';

        return (
          <div 
            key={index} 
            className={`progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            onClick={() => isClickable && handleStepClick(index)}
            style={{ cursor: isClickable ? 'pointer' : 'default' }}
          >
            <div className="step-circle">
              {isCompleted ? '✓' : stepNum}
            </div>
            <div className="step-label">
              {stepName}
            </div>
          </div>
        );
      })}
    </div>
  );
};
