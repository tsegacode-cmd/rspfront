/**
 * User Preferences Storage Service
 * Manages user preferences like theme, language, etc.
 */

import { storage } from '../utils/storage.js';

const PREFERENCES_KEY = 'user_preferences';

const DEFAULT_PREFERENCES = {
  theme: 'light',
  language: 'ar',
  currency: 'SAR',
  notifications: true,
  emailNotifications: true,
  autoSave: true,
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  itemsPerPage: 10
};

class PreferencesStorageService {
  /**
   * Get all preferences
   */
  getPreferences() {
    const preferences = storage.getItem(PREFERENCES_KEY);
    return preferences ? { ...DEFAULT_PREFERENCES, ...preferences } : DEFAULT_PREFERENCES;
  }

  /**
   * Set all preferences
   */
  setPreferences(preferences) {
    const current = this.getPreferences();
    const updated = { ...current, ...preferences };
    return storage.setItem(PREFERENCES_KEY, updated);
  }

  /**
   * Get specific preference
   */
  getPreference(key) {
    const preferences = this.getPreferences();
    return preferences[key];
  }

  /**
   * Set specific preference
   */
  setPreference(key, value) {
    const preferences = this.getPreferences();
    preferences[key] = value;
    return storage.setItem(PREFERENCES_KEY, preferences);
  }

  /**
   * Reset to default preferences
   */
  resetPreferences() {
    return storage.setItem(PREFERENCES_KEY, DEFAULT_PREFERENCES);
  }

  /**
   * Get theme
   */
  getTheme() {
    return this.getPreference('theme');
  }

  /**
   * Set theme
   */
  setTheme(theme) {
    return this.setPreference('theme', theme);
  }

  /**
   * Toggle theme
   */
  toggleTheme() {
    const currentTheme = this.getTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    return this.setTheme(newTheme);
  }

  /**
   * Get language
   */
  getLanguage() {
    return this.getPreference('language');
  }

  /**
   * Set language
   */
  setLanguage(language) {
    return this.setPreference('language', language);
  }

  /**
   * Get currency
   */
  getCurrency() {
    return this.getPreference('currency');
  }

  /**
   * Set currency
   */
  setCurrency(currency) {
    return this.setPreference('currency', currency);
  }

  /**
   * Export preferences
   */
  exportPreferences() {
    return JSON.stringify(this.getPreferences(), null, 2);
  }

  /**
   * Import preferences
   */
  importPreferences(jsonString) {
    try {
      const preferences = JSON.parse(jsonString);
      return this.setPreferences(preferences);
    } catch (error) {
      console.error('Error importing preferences:', error);
      return false;
    }
  }
}

export const preferencesStorage = new PreferencesStorageService();
