/**
 * usePreferences Hook
 * React hook for user preferences management
 */

import { useState, useCallback, useEffect } from 'react';
import { preferencesStorage } from '../services/preferencesStorage.js';

export function usePreferences() {
  const [preferences, setPreferences] = useState(preferencesStorage.getPreferences());

  // Update preferences
  const updatePreferences = useCallback((newPreferences) => {
    preferencesStorage.setPreferences(newPreferences);
    setPreferences(preferencesStorage.getPreferences());
  }, []);

  // Update single preference
  const updatePreference = useCallback((key, value) => {
    preferencesStorage.setPreference(key, value);
    setPreferences(preferencesStorage.getPreferences());
  }, []);

  // Reset preferences
  const resetPreferences = useCallback(() => {
    preferencesStorage.resetPreferences();
    setPreferences(preferencesStorage.getPreferences());
  }, []);

  // Theme management
  const theme = preferences.theme;
  const setTheme = useCallback((newTheme) => {
    updatePreference('theme', newTheme);
  }, [updatePreference]);

  const toggleTheme = useCallback(() => {
    preferencesStorage.toggleTheme();
    setPreferences(preferencesStorage.getPreferences());
  }, []);

  // Language management
  const language = preferences.language;
  const setLanguage = useCallback((newLanguage) => {
    updatePreference('language', newLanguage);
  }, [updatePreference]);

  // Currency management
  const currency = preferences.currency;
  const setCurrency = useCallback((newCurrency) => {
    updatePreference('currency', newCurrency);
  }, [updatePreference]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Apply language to document
  useEffect(() => {
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  return {
    preferences,
    updatePreferences,
    updatePreference,
    resetPreferences,
    theme,
    setTheme,
    toggleTheme,
    language,
    setLanguage,
    currency,
    setCurrency
  };
}
