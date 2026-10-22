/**
 * useSearchHistory Hook
 * React hook for search history management
 */

import { useState, useCallback } from 'react';
import { historyStorage } from '../services/historyStorage.js';

export function useSearchHistory(maxItems = 50) {
  const [history, setHistory] = useState(historyStorage.getSearchHistory(maxItems));

  // Add search to history
  const addSearch = useCallback((query, metadata = {}) => {
    historyStorage.addSearch(query, metadata);
    setHistory(historyStorage.getSearchHistory(maxItems));
  }, [maxItems]);

  // Remove search from history
  const removeSearch = useCallback((query) => {
    historyStorage.removeSearch(query);
    setHistory(historyStorage.getSearchHistory(maxItems));
  }, [maxItems]);

  // Clear all history
  const clearHistory = useCallback(() => {
    historyStorage.clearSearchHistory();
    setHistory([]);
  }, []);

  // Get popular searches
  const getPopular = useCallback((limit = 10) => {
    return historyStorage.getPopularSearches(limit);
  }, []);

  // Search in history
  const searchInHistory = useCallback((searchTerm) => {
    return historyStorage.searchHistory(searchTerm);
  }, []);

  // Refresh history
  const refresh = useCallback(() => {
    setHistory(historyStorage.getSearchHistory(maxItems));
  }, [maxItems]);

  return {
    history,
    addSearch,
    removeSearch,
    clearHistory,
    getPopular,
    searchInHistory,
    refresh
  };
}
