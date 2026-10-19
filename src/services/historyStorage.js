/**
 * History Storage Service
 * Manages search history and recent items
 */

import { storage } from '../utils/storage.js';

const SEARCH_HISTORY_KEY = 'search_history';
const RECENT_ITEMS_KEY = 'recent_items';
const MAX_HISTORY_ITEMS = 50;
const MAX_RECENT_ITEMS = 20;

class HistoryStorageService {
  /**
   * Add search to history
   */
  addSearch(query, metadata = {}) {
    const history = this.getSearchHistory();
    
    const searchItem = {
      query,
      metadata,
      timestamp: Date.now()
    };

    // Remove duplicate if exists
    const filtered = history.filter(item => item.query !== query);
    
    // Add to beginning
    filtered.unshift(searchItem);

    // Limit size
    const limited = filtered.slice(0, MAX_HISTORY_ITEMS);

    return storage.setItem(SEARCH_HISTORY_KEY, limited);
  }

  /**
   * Get search history
   */
  getSearchHistory(limit = MAX_HISTORY_ITEMS) {
    const history = storage.getItem(SEARCH_HISTORY_KEY) || [];
    return history.slice(0, limit);
  }

  /**
   * Clear search history
   */
  clearSearchHistory() {
    return storage.removeItem(SEARCH_HISTORY_KEY);
  }

  /**
   * Remove specific search from history
   */
  removeSearch(query) {
    const history = this.getSearchHistory();
    const filtered = history.filter(item => item.query !== query);
    return storage.setItem(SEARCH_HISTORY_KEY, filtered);
  }

  /**
   * Get popular searches
   */
  getPopularSearches(limit = 10) {
    const history = this.getSearchHistory();
    const queryCount = {};

    history.forEach(item => {
      queryCount[item.query] = (queryCount[item.query] || 0) + 1;
    });

    return Object.entries(queryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([query, count]) => ({ query, count }));
  }

  /**
   * Add recent item
   */
  addRecentItem(item, type = 'general') {
    const recentItems = this.getRecentItems();
    
    const recentItem = {
      ...item,
      type,
      timestamp: Date.now()
    };

    // Remove duplicate if exists (by id)
    const filtered = recentItems.filter(i => i.id !== item.id);
    
    // Add to beginning
    filtered.unshift(recentItem);

    // Limit size
    const limited = filtered.slice(0, MAX_RECENT_ITEMS);

    return storage.setItem(RECENT_ITEMS_KEY, limited);
  }

  /**
   * Get recent items
   */
  getRecentItems(type = null, limit = MAX_RECENT_ITEMS) {
    const items = storage.getItem(RECENT_ITEMS_KEY) || [];
    
    const filtered = type 
      ? items.filter(item => item.type === type)
      : items;

    return filtered.slice(0, limit);
  }

  /**
   * Clear recent items
   */
  clearRecentItems(type = null) {
    if (type) {
      const items = this.getRecentItems();
      const filtered = items.filter(item => item.type !== type);
      return storage.setItem(RECENT_ITEMS_KEY, filtered);
    }
    return storage.removeItem(RECENT_ITEMS_KEY);
  }

  /**
   * Remove specific recent item
   */
  removeRecentItem(itemId) {
    const items = this.getRecentItems();
    const filtered = items.filter(item => item.id !== itemId);
    return storage.setItem(RECENT_ITEMS_KEY, filtered);
  }

  /**
   * Get recent searches (alias for backward compatibility)
   */
  getRecentSearches(limit = 10) {
    return this.getSearchHistory(limit);
  }

  /**
   * Search in history
   */
  searchHistory(searchTerm) {
    const history = this.getSearchHistory();
    return history.filter(item => 
      item.query.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  /**
   * Get history statistics
   */
  getHistoryStats() {
    const searchHistory = this.getSearchHistory();
    const recentItems = this.getRecentItems();

    return {
      totalSearches: searchHistory.length,
      totalRecentItems: recentItems.length,
      oldestSearch: searchHistory[searchHistory.length - 1]?.timestamp || null,
      newestSearch: searchHistory[0]?.timestamp || null
    };
  }

  /**
   * Export history
   */
  exportHistory() {
    return {
      searchHistory: this.getSearchHistory(),
      recentItems: this.getRecentItems(),
      exportedAt: Date.now()
    };
  }

  /**
   * Import history
   */
  importHistory(historyData) {
    try {
      if (historyData.searchHistory) {
        storage.setItem(SEARCH_HISTORY_KEY, historyData.searchHistory);
      }
      if (historyData.recentItems) {
        storage.setItem(RECENT_ITEMS_KEY, historyData.recentItems);
      }
      return true;
    } catch (error) {
      console.error('Error importing history:', error);
      return false;
    }
  }
}

export const historyStorage = new HistoryStorageService();
