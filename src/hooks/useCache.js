/**
 * useCache Hook
 * React hook for cache management
 */

import { useState, useCallback, useEffect } from 'react';
import { cacheStorage } from '../services/cacheStorage.js';

export function useCache(key, fetcher, options = {}) {
  const {
    ttl = 3600,
    strategy = 'default',
    enabled = true
  } = options;

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isCached, setIsCached] = useState(false);

  // Fetch data with caching
  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      // Check cache first
      if (!forceRefresh) {
        const cached = cacheStorage.get(key);
        if (cached) {
          setData(cached);
          setIsCached(true);
          setIsLoading(false);
          return cached;
        }
      }

      // Fetch fresh data
      const freshData = await fetcher();
      
      // Cache the result
      if (strategy === 'default') {
        cacheStorage.set(key, freshData, ttl);
      } else {
        cacheStorage.setWithStrategy(key, freshData, strategy);
      }

      setData(freshData);
      setIsCached(false);
      setIsLoading(false);
      
      return freshData;
    } catch (err) {
      setError(err);
      setIsLoading(false);
      throw err;
    }
  }, [key, fetcher, ttl, strategy, enabled]);

  // Invalidate cache
  const invalidate = useCallback(() => {
    cacheStorage.remove(key);
    setData(null);
    setIsCached(false);
  }, [key]);

  // Refresh data
  const refresh = useCallback(() => {
    return fetchData(true);
  }, [fetchData]);

  // Load data on mount
  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled]); // Only run on mount or when enabled changes

  return {
    data,
    isLoading,
    error,
    isCached,
    refresh,
    invalidate,
    fetchData
  };
}
