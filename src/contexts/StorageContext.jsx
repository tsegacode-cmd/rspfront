/**
 * Storage Context Provider
 * Provides centralized storage management throughout the app
 */

import { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { storage } from '../utils/storage.js';
import { cacheStorage } from '../services/cacheStorage.js';
import { formStorage } from '../services/formStorage.js';
import { historyStorage } from '../services/historyStorage.js';

const StorageContext = createContext(null);

export function StorageProvider({ children }) {
  const [storageSize, setStorageSize] = useState(0);
  const [cacheStats, setCacheStats] = useState({ total: 0, valid: 0, expired: 0 });

  // Update storage statistics
  const updateStats = useCallback(() => {
    setStorageSize(storage.getStorageSize());
    setCacheStats(cacheStorage.getStats());
  }, []);

  // Clear all storage
  const clearAll = useCallback(() => {
    storage.clear();
    updateStats();
  }, [updateStats]);

  // Clear expired cache
  const clearExpiredCache = useCallback(() => {
    cacheStorage.clearExpired();
    updateStats();
  }, [updateStats]);

  // Clear old form drafts
  const clearOldDrafts = useCallback((days = 7) => {
    formStorage.clearOldDrafts(days);
    updateStats();
  }, [updateStats]);

  // Cleanup storage
  const cleanup = useCallback(() => {
    storage.cleanupExpiredItems();
    cacheStorage.clearExpired();
    formStorage.clearOldDrafts(7);
    updateStats();
  }, [updateStats]);

  // Export all data
  const exportData = useCallback(() => {
    return {
      history: historyStorage.exportHistory(),
      timestamp: Date.now()
    };
  }, []);

  // Import data
  const importData = useCallback((data) => {
    try {
      if (data.history) {
        historyStorage.importHistory(data.history);
      }
      updateStats();
      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }, [updateStats]);

  // Update stats on mount and periodically
  useEffect(() => {
    updateStats();
    
    // Update stats every 5 minutes
    const interval = setInterval(updateStats, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [updateStats]);

  const value = {
    storageSize,
    cacheStats,
    updateStats,
    clearAll,
    clearExpiredCache,
    clearOldDrafts,
    cleanup,
    exportData,
    importData
  };

  return (
    <StorageContext.Provider value={value}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorageContext() {
  const context = useContext(StorageContext);
  if (!context) {
    throw new Error('useStorageContext must be used within StorageProvider');
  }
  return context;
}
