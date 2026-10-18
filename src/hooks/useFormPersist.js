/**
 * useFormPersist Hook
 * React hook for form data persistence and auto-save
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { formStorage } from '../services/formStorage.js';

export function useFormPersist(formId, initialValues = {}, options = {}) {
  const {
    autoSave = true,
    autoSaveDelay = 1000,
    loadOnMount = true
  } = options;

  // Load saved draft or use initial values
  const [formData, setFormData] = useState(() => {
    if (loadOnMount) {
      const draft = formStorage.getDraft(formId);
      return draft ? draft.data : initialValues;
    }
    return initialValues;
  });

  const [isDirty, setIsDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const autoSaveTimeoutRef = useRef(null);

  // Update form data
  const updateFormData = useCallback((updates) => {
    setFormData(prev => {
      const updated = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };
      return updated;
    });
    setIsDirty(true);
  }, []);

  // Save draft manually
  const saveDraft = useCallback((metadata = {}) => {
    const success = formStorage.saveDraft(formId, formData, metadata);
    if (success) {
      setLastSaved(Date.now());
      setIsDirty(false);
    }
    return success;
  }, [formId, formData]);

  // Delete draft
  const deleteDraft = useCallback(() => {
    formStorage.deleteDraft(formId);
    setFormData(initialValues);
    setIsDirty(false);
    setLastSaved(null);
  }, [formId, initialValues]);

  // Reset form
  const resetForm = useCallback(() => {
    setFormData(initialValues);
    setIsDirty(false);
  }, [initialValues]);

  // Check if draft exists
  const hasDraft = formStorage.hasDraft(formId);

  // Auto-save effect
  useEffect(() => {
    if (autoSave && isDirty) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        saveDraft({ autoSaved: true });
      }, autoSaveDelay);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [formData, isDirty, autoSave, autoSaveDelay, saveDraft]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  return {
    formData,
    updateFormData,
    saveDraft,
    deleteDraft,
    resetForm,
    isDirty,
    lastSaved,
    hasDraft
  };
}
