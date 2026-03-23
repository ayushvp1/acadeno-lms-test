import React, { createContext, useContext, useState, useEffect } from 'react';
import { registrationApi } from '../api/registrationApi';

const RegistrationContext = createContext();

export const useRegistration = () => useContext(RegistrationContext);

export const RegistrationProvider = ({ children }) => {
  const [draftId, setDraftId] = useState(null);
  const [registrationNumber, setRegistrationNumber] = useState(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [mode, setMode] = useState('create'); // 'create', 'edit', 'view'
<<<<<<< HEAD
  // guestMode: true when the wizard is accessed via a one-time invite link by a
  // converted lead.  Hides staff navigation and shows a credentials-focused
  // success screen after submission.
  const [guestMode, setGuestMode] = useState(false);
=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Draft Data state
  const [formData, setFormData] = useState({
    personal_details: null,
    address_documents: null,
    academic: null,
    course_batch: null,
  });

  // Calculate highest step completed to prevent skipping ahead
  const [highestStep, setHighestStep] = useState(1);

  // Update highest step whenever form data changes
  useEffect(() => {
    let step = 1;
    if (formData.personal_details) step = 2;
    if (formData.address_documents) step = 3;
    if (formData.academic) step = 4;
    // Don't auto-advance to 5 (Review), only set highest allowable step.
    if (formData.course_batch) step = 5;
    
    // In edit/view mode, all steps are accessible
    if (mode !== 'create') {
      setHighestStep(5);
    } else {
      setHighestStep(Math.max(highestStep, step));
    }
  }, [formData, mode]);

  const loadDraft = async (id, setModeTo = 'view') => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await registrationApi.getRegistration(id);
      setDraftId(data.id);
      setRegistrationNumber(data.registration_number);
      setFormData({
        personal_details: data.personal_details || null,
        address_documents: data.address_documents || null,
        academic: data.academic || null,
        course_batch: data.course_batch || null,
      });
      setMode(setModeTo);
      setCurrentStep(1); // Default back to start
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load registration');
    } finally {
      setIsLoading(false);
    }
  };

  const saveStep = async (stepNum, sectionKey, dataPayload, isFormData = false) => {
    setIsLoading(true);
    setError(null);
    try {
      let result;
      
<<<<<<< HEAD
      let draftIdToUse = draftId;

      // Helper to parse FormData into object
      const parsePayload = (payload, isForm) => isForm ? Object.fromEntries(payload.entries()) : payload;

=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
      // Step 1: Create or Update Draft
      if (stepNum === 1) {
        if (!draftId) {
          result = await registrationApi.createDraft(dataPayload, isFormData);
<<<<<<< HEAD
          draftIdToUse = result.draft_id;
=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
          setDraftId(result.draft_id);
          setRegistrationNumber(result.registration_number);
        } else {
          await registrationApi.updatePersonal(draftId, dataPayload, isFormData);
        }
<<<<<<< HEAD
        setFormData(prev => ({ ...prev, personal_details: { ...prev.personal_details, ...parsePayload(dataPayload, isFormData) } }));
      // Step 2: Address
      } else if (stepNum === 2) {
        await registrationApi.updateAddress(draftId, dataPayload);
        setFormData(prev => ({ ...prev, address_documents: { ...prev.address_documents, ...parsePayload(dataPayload, false) } }));
      // Step 3: Academic
      } else if (stepNum === 3) {
        await registrationApi.updateAcademic(draftId, dataPayload, isFormData);
        setFormData(prev => ({ ...prev, academic: { ...prev.academic, ...parsePayload(dataPayload, isFormData) } }));
      // Step 4: Course
      } else if (stepNum === 4) {
        result = await registrationApi.updateCourse(draftId, dataPayload);
=======
      // Step 2: Address
      } else if (stepNum === 2) {
        await registrationApi.updateAddress(draftId, dataPayload);
      // Step 3: Academic
      } else if (stepNum === 3) {
        await registrationApi.updateAcademic(draftId, dataPayload, isFormData);
      // Step 4: Course
      } else if (stepNum === 4) {
        result = await registrationApi.updateCourse(draftId, dataPayload);
        // Specifically update formData state for course_batch to immediately show fee summary
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
        setFormData(prev => ({
          ...prev,
          course_batch: {
            ...prev.course_batch,
<<<<<<< HEAD
            ...parsePayload(dataPayload, false),
            base_fee: result.fee_summary?.base_fee,
            gst_amount: result.fee_summary?.gst_amount,
            total_fee: result.fee_summary?.total_fee,
          }
        }));
        
        // Let's refetch draft specifically after step 4 to make sure course and batch names are populated
        // because the updateCourse API does not return course_name / batch_name, but we need them for review
        const fullDraft = await registrationApi.getRegistration(draftId);
        setFormData({
          personal_details: fullDraft.personal_details || null,
          address_documents: fullDraft.address_documents || null,
          academic: fullDraft.academic || null,
          course_batch: fullDraft.course_batch || null,
        });
=======
            ...dataPayload,
            base_fee: result.fee_summary?.base_fee,
            gst_amount: result.fee_summary?.gst_amount,
            total_fee: result.fee_summary?.total_fee
          }
        }));
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
      }

      // If we are in create mode, advance step
      if (mode === 'create') {
        const nextStep = stepNum + 1;
        setHighestStep(Math.max(highestStep, nextStep));
        setCurrentStep(nextStep);
      } else if (mode === 'edit') {
        // If in edit mode, editing from the review screen jumps back
        // After editing a step, go back to review screen
        setCurrentStep(5);
      }
      return true;
    } catch (err) {
      setError(err.response?.data?.error || `Failed to save step ${stepNum}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const submitFinal = async (consent) => {
    setIsLoading(true);
    setError(null);
    try {
<<<<<<< HEAD
      const result = await registrationApi.submitDraft(draftId, { 
        privacy_consent: consent
      });
=======
      const result = await registrationApi.submitDraft(draftId, { privacy_consent: consent });
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
      return result;
    } catch (err) {
      setError(err.response?.data?.error || 'Submission failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const editRegistration = async (updatePayload) => {
    setIsLoading(true);
    setError(null);
    try {
      await registrationApi.editRegistration(draftId, updatePayload);
      return true;
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setDraftId(null);
    setRegistrationNumber(null);
    setCurrentStep(1);
    setHighestStep(1);
    setMode('create');
<<<<<<< HEAD
    setGuestMode(false);
=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    setError(null);
    setFormData({
      personal_details: null,
      address_documents: null,
      academic: null,
      course_batch: null,
    });
  };

  const value = {
    draftId,
    registrationNumber,
    currentStep,
    setCurrentStep,
    highestStep,
    mode,
    setMode,
<<<<<<< HEAD
    guestMode,
    setGuestMode,
=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    isLoading,
    error,
    setError,
    formData,
    setFormData,
    loadDraft,
    saveStep,
    submitFinal,
    editRegistration,
    resetForm
  };

  return (
    <RegistrationContext.Provider value={value}>
      {children}
    </RegistrationContext.Provider>
  );
};
