/**
 * Local Storage Utility
 * Provides type-safe localStorage wrapper with error handling and fallback
 */

class StorageUtility {
  constructor() {
    this.isAvailable = this.checkAvailability();
    this.memoryFallback = new Map();
  }

  /**
   * Check if localStorage is available
   */
  checkAvailability() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      console.warn('localStorage is not available, using memory fallback');
      return false;
    }
  }

  /**
   * Get item from storage
   */
  getItem(key) {
    try {
      if (this.isAvailable) {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      }
      return this.memoryFallback.get(key) || null;
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      return null;
    }
  }

  /**
   * Set item in storage
   */
  setItem(key, value) {
    try {
      const serialized = JSON.stringify(value);
      if (this.isAvailable) {
        localStorage.setItem(key, serialized);
      } else {
        this.memoryFallback.set(key, value);
      }
      return true;
    } catch (error) {
      console.error(`Error setting item ${key}:`, error);
      if (error.name === 'QuotaExceededError') {
        this.handleQuotaExceeded();
      }
      return false;
    }
  }

  /**
   * Remove item from storage
   */
  removeItem(key) {
    try {
      if (this.isAvailable) {
        localStorage.removeItem(key);
      } else {
        this.memoryFallback.delete(key);
      }
      return true;
    } catch (error) {
      console.error(`Error removing item ${key}:`, error);
      return false;
    }
  }

  /**
   * Clear all storage
   */
  clear() {
    try {
      if (this.isAvailable) {
        localStorage.clear();
      } else {
        this.memoryFallback.clear();
      }
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  }

  /**
   * Get all keys
   */
  getAllKeys() {
    try {
      if (this.isAvailable) {
        return Object.keys(localStorage);
      }
      return Array.from(this.memoryFallback.keys());
    } catch (error) {
      console.error('Error getting all keys:', error);
      return [];
    }
  }

  /**
   * Get storage size in bytes
   */
  getStorageSize() {
    try {
      if (this.isAvailable) {
        let total = 0;
        for (let key in localStorage) {
          if (localStorage.hasOwnProperty(key)) {
            total += localStorage[key].length + key.length;
          }
        }
        return total;
      }
      return 0;
    } catch (error) {
      console.error('Error calculating storage size:', error);
      return 0;
    }
  }

  /**
   * Handle quota exceeded error
   */
  handleQuotaExceeded() {
    console.warn('Storage quota exceeded, attempting cleanup...');
    this.cleanupExpiredItems();
  }

  /**
   * Cleanup expired items
   */
  cleanupExpiredItems() {
    const keys = this.getAllKeys();
    keys.forEach(key => {
      if (key.startsWith('cache_') || key.startsWith('temp_')) {
        const item = this.getItem(key);
        if (item && item.expiresAt && item.expiresAt < Date.now()) {
          this.removeItem(key);
        }
      }
    });
  }
}

export const storage = new StorageUtility();
