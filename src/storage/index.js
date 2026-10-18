/**
 * Storage System - Main Export
 * Central export point for the entire storage system
 */

// Utilities
export { storage } from '../utils/storage.js';
export { encrypt, decrypt, hash } from '../utils/encryption.js';

// Services
export {
  authStorage,
  sessionStorage,
  preferencesStorage,
  cacheStorage,
  formStorage,
  historyStorage
} from '../services/index.js';

// Hooks
export {
  useLocalStorage,
  useAuth,
  usePreferences,
  useFormPersist,
  useCache,
  useSearchHistory
} from '../hooks/index.js';

// Contexts
export {
  AuthProvider,
  useAuthContext,
  PreferencesProvider,
  usePreferencesContext,
  StorageProvider,
  useStorageContext
} from '../contexts/index.js';

// Components
export { StorageManager } from '../components/StorageManager.jsx';

// Test utilities (for development)
export * as storageTest from '../utils/storageTest.js';
