/**
 * Form Storage Service
 * Handles form data persistence and draft saving
 */

import { storage } from '../utils/storage.js';

const FORM_PREFIX = 'form_draft_';
const FORM_INDEX_KEY = 'form_drafts_index';

class FormStorageService {
  /**
   * Save form draft
   */
  saveDraft(formId, formData, metadata = {}) {
    const draftKey = FORM_PREFIX + formId;
    const draft = {
      formId,
      data: formData,
      metadata,
      savedAt: Date.now(),
      updatedAt: Date.now()
    };

    const success = storage.setItem(draftKey, draft);
    
    if (success) {
      this.updateIndex(formId);
    }

    return success;
  }

  /**
   * Get form draft
   */
  getDraft(formId) {
    const draftKey = FORM_PREFIX + formId;
    return storage.getItem(draftKey);
  }

  /**
   * Update form draft
   */
  updateDraft(formId, formData, metadata = {}) {
    const draft = this.getDraft(formId);
    
    if (!draft) {
      return this.saveDraft(formId, formData, metadata);
    }

    const updatedDraft = {
      ...draft,
      data: { ...draft.data, ...formData },
      metadata: { ...draft.metadata, ...metadata },
      updatedAt: Date.now()
    };

    return storage.setItem(FORM_PREFIX + formId, updatedDraft);
  }

  /**
   * Delete form draft
   */
  deleteDraft(formId) {
    const draftKey = FORM_PREFIX + formId;
    storage.removeItem(draftKey);
    this.removeFromIndex(formId);
  }

  /**
   * Check if draft exists
   */
  hasDraft(formId) {
    return !!this.getDraft(formId);
  }

  /**
   * Get all drafts
   */
  getAllDrafts() {
    const index = this.getIndex();
    return index.map(formId => this.getDraft(formId)).filter(Boolean);
  }

  /**
   * Clear all drafts
   */
  clearAllDrafts() {
    const index = this.getIndex();
    index.forEach(formId => {
      this.deleteDraft(formId);
    });
    storage.removeItem(FORM_INDEX_KEY);
  }

  /**
   * Clear old drafts (older than specified days)
   */
  clearOldDrafts(days = 7) {
    const maxAge = days * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const index = this.getIndex();

    index.forEach(formId => {
      const draft = this.getDraft(formId);
      if (draft && (now - draft.updatedAt) > maxAge) {
        this.deleteDraft(formId);
      }
    });
  }

  /**
   * Get draft index
   */
  getIndex() {
    return storage.getItem(FORM_INDEX_KEY) || [];
  }

  /**
   * Update draft index
   */
  updateIndex(formId) {
    const index = this.getIndex();
    if (!index.includes(formId)) {
      index.push(formId);
      storage.setItem(FORM_INDEX_KEY, index);
    }
  }

  /**
   * Remove from draft index
   */
  removeFromIndex(formId) {
    const index = this.getIndex();
    const filtered = index.filter(id => id !== formId);
    storage.setItem(FORM_INDEX_KEY, filtered);
  }

  /**
   * Get draft age in milliseconds
   */
  getDraftAge(formId) {
    const draft = this.getDraft(formId);
    return draft ? Date.now() - draft.updatedAt : null;
  }

  /**
   * Auto-save form data
   */
  autoSave(formId, formData, debounceMs = 1000) {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.updateDraft(formId, formData, { autoSaved: true });
    }, debounceMs);
  }

  /**
   * Export draft
   */
  exportDraft(formId) {
    const draft = this.getDraft(formId);
    return draft ? JSON.stringify(draft, null, 2) : null;
  }

  /**
   * Import draft
   */
  importDraft(jsonString) {
    try {
      const draft = JSON.parse(jsonString);
      return this.saveDraft(draft.formId, draft.data, draft.metadata);
    } catch (error) {
      console.error('Error importing draft:', error);
      return false;
    }
  }
}

export const formStorage = new FormStorageService();
