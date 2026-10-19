/**
 * Cache Storage Service
 * Manages cached data with expiration and offline support
 */

import { storage } from '../utils/storage.js';

const CACHE_PREFIX = 'cache_';
const CACHE_INDEX_KEY = 'cache_index';

class CacheStorageService {
  /**
   * Set cache item with expiration
   */
  set(key, data, ttl = 3600) {
    const cacheKey = CACHE_PREFIX + key;
    const cacheItem = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + (ttl * 1000)
    };

    const success = storage.setItem(cacheKey, cacheItem);
    
    if (success) {
      this.updateIndex(key, cacheItem.expiresAt);
    }

    return success;
  }

  /**
   * Get cache item
   */
  get(key) {
    const cacheKey = CACHE_PREFIX + key;
    const cacheItem = storage.getItem(cacheKey);

    if (!cacheItem) return null;

    // Check if expired
    if (Date.now() > cacheItem.expiresAt) {
      this.remove(key);
      return null;
    }

    return cacheItem.data;
  }

  /**
   * Remove cache item
   */
  remove(key) {
    const cacheKey = CACHE_PREFIX + key;
    storage.removeItem(cacheKey);
    this.removeFromIndex(key);
  }

  /**
   * Check if cache exists and is valid
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Clear all cache
   */
  clear() {
    const index = this.getIndex();
    Object.keys(index).forEach(key => {
      this.remove(key);
    });
    storage.removeItem(CACHE_INDEX_KEY);
  }

  /**
   * Clear expired cache items
   */
  clearExpired() {
    const index = this.getIndex();
    const now = Date.now();

    Object.entries(index).forEach(([key, expiresAt]) => {
      if (now > expiresAt) {
        this.remove(key);
      }
    });
  }

  /**
   * Get cache index
   */
  getIndex() {
    return storage.getItem(CACHE_INDEX_KEY) || {};
  }

  /**
   * Update cache index
   */
  updateIndex(key, expiresAt) {
    const index = this.getIndex();
    index[key] = expiresAt;
    storage.setItem(CACHE_INDEX_KEY, index);
  }

  /**
   * Remove from cache index
   */
  removeFromIndex(key) {
    const index = this.getIndex();
    delete index[key];
    storage.setItem(CACHE_INDEX_KEY, index);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const index = this.getIndex();
    const keys = Object.keys(index);
    const now = Date.now();

    const valid = keys.filter(key => index[key] > now).length;
    const expired = keys.length - valid;

    return {
      total: keys.length,
      valid,
      expired
    };
  }

  /**
   * Get cache size
   */
  getSize() {
    const index = this.getIndex();
    let totalSize = 0;

    Object.keys(index).forEach(key => {
      const cacheKey = CACHE_PREFIX + key;
      const item = storage.getItem(cacheKey);
      if (item) {
        totalSize += JSON.stringify(item).length;
      }
    });

    return totalSize;
  }

  /**
   * Set with custom strategy
   */
  setWithStrategy(key, data, strategy = 'default') {
    const strategies = {
      default: 3600,      // 1 hour
      short: 300,         // 5 minutes
      medium: 1800,       // 30 minutes
      long: 86400,        // 24 hours
      week: 604800        // 7 days
    };

    const ttl = strategies[strategy] || strategies.default;
    return this.set(key, data, ttl);
  }
}

export const cacheStorage = new CacheStorageService();
