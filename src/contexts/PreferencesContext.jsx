/**
 * Preferences Context Provider
 * Provides user preferences state and methods throughout the app
 */

import { createContext, useContext } from 'react';
import { usePreferences } from '../hooks/usePreferences.js';

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const preferences = usePreferences();

  return (
    <PreferencesContext.Provider value={preferences}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferencesContext() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferencesContext must be used within PreferencesProvider');
  }
  return context;
}
