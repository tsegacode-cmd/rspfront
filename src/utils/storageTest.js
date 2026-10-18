/**
 * Storage System Test Utilities
 * Helper functions to test and verify storage functionality
 */

import { storage } from './storage.js';
import { authStorage } from '../services/authStorage.js';
import { cacheStorage } from '../services/cacheStorage.js';
import { formStorage } from '../services/formStorage.js';
import { preferencesStorage } from '../services/preferencesStorage.js';
import { historyStorage } from '../services/historyStorage.js';

/**
 * Test basic storage functionality
 */
export function testBasicStorage() {
  console.log('Testing basic storage...');
  
  const testKey = 'test_key';
  const testValue = { message: 'Hello, World!', timestamp: Date.now() };
  
  // Test set
  const setResult = storage.setItem(testKey, testValue);
  console.log('Set item:', setResult ? '✓' : '✗');
  
  // Test get
  const getValue = storage.getItem(testKey);
  console.log('Get item:', getValue?.message === testValue.message ? '✓' : '✗');
  
  // Test remove
  storage.removeItem(testKey);
  const removedValue = storage.getItem(testKey);
  console.log('Remove item:', removedValue === null ? '✓' : '✗');
  
  return setResult && getValue && removedValue === null;
}

/**
 * Test authentication storage
 */
export function testAuthStorage() {
  console.log('Testing auth storage...');
  
  const testToken = 'test_jwt_token_12345';
  const testUser = { id: 1, name: 'Test User', email: 'test@example.com' };
  
  // Test set token
  authStorage.setToken(testToken, 3600);
  const token = authStorage.getToken();
  console.log('Set/Get token:', token === testToken ? '✓' : '✗');
  
  // Test set user data
  authStorage.setUserData(testUser);
  const user = authStorage.getUserData();
  console.log('Set/Get user:', user?.email === testUser.email ? '✓' : '✗');
  
  // Test is authenticated
  const isAuth = authStorage.isAuthenticated();
  console.log('Is authenticated:', isAuth ? '✓' : '✗');
  
  // Test clear
  authStorage.clearAuth();
  const clearedToken = authStorage.getToken();
  console.log('Clear auth:', clearedToken === null ? '✓' : '✗');
  
  return token && user && isAuth && !clearedToken;
}

/**
 * Test cache storage
 */
export function testCacheStorage() {
  console.log('Testing cache storage...');
  
  const testKey = 'test_cache';
  const testData = { items: [1, 2, 3], total: 3 };
  
  // Test set cache
  cacheStorage.set(testKey, testData, 60);
  const cached = cacheStorage.get(testKey);
  console.log('Set/Get cache:', cached?.total === testData.total ? '✓' : '✗');
  
  // Test has cache
  const hasCache = cacheStorage.has(testKey);
  console.log('Has cache:', hasCache ? '✓' : '✗');
  
  // Test remove cache
  cacheStorage.remove(testKey);
  const removed = cacheStorage.get(testKey);
  console.log('Remove cache:', removed === null ? '✓' : '✗');
  
  return cached && hasCache && !removed;
}

/**
 * Test form storage
 */
export function testFormStorage() {
  console.log('Testing form storage...');
  
  const formId = 'test_form';
  const formData = { name: 'John', email: 'john@example.com' };
  
  // Test save draft
  formStorage.saveDraft(formId, formData);
  const draft = formStorage.getDraft(formId);
  console.log('Save/Get draft:', draft?.data?.name === formData.name ? '✓' : '✗');
  
  // Test has draft
  const hasDraft = formStorage.hasDraft(formId);
  console.log('Has draft:', hasDraft ? '✓' : '✗');
  
  // Test update draft
  formStorage.updateDraft(formId, { name: 'Jane' });
  const updated = formStorage.getDraft(formId);
  console.log('Update draft:', updated?.data?.name === 'Jane' ? '✓' : '✗');
  
  // Test delete draft
  formStorage.deleteDraft(formId);
  const deleted = formStorage.getDraft(formId);
  console.log('Delete draft:', deleted === null ? '✓' : '✗');
  
  return draft && hasDraft && updated && !deleted;
}

/**
 * Test preferences storage
 */
export function testPreferencesStorage() {
  console.log('Testing preferences storage...');
  
  // Test get preferences
  const prefs = preferencesStorage.getPreferences();
  console.log('Get preferences:', prefs ? '✓' : '✗');
  
  // Test set theme
  preferencesStorage.setTheme('dark');
  const theme = preferencesStorage.getTheme();
  console.log('Set/Get theme:', theme === 'dark' ? '✓' : '✗');
  
  // Test toggle theme
  preferencesStorage.toggleTheme();
  const toggled = preferencesStorage.getTheme();
  console.log('Toggle theme:', toggled === 'light' ? '✓' : '✗');
  
  // Test set language
  preferencesStorage.setLanguage('en');
  const lang = preferencesStorage.getLanguage();
  console.log('Set/Get language:', lang === 'en' ? '✓' : '✗');
  
  return prefs && theme && toggled && lang;
}

/**
 * Test history storage
 */
export function testHistoryStorage() {
  console.log('Testing history storage...');
  
  // Test add search
  historyStorage.addSearch('test query 1');
  historyStorage.addSearch('test query 2');
  const history = historyStorage.getSearchHistory();
  console.log('Add search:', history.length >= 2 ? '✓' : '✗');
  
  // Test remove search
  historyStorage.removeSearch('test query 1');
  const afterRemove = historyStorage.getSearchHistory();
  console.log('Remove search:', afterRemove.length === history.length - 1 ? '✓' : '✗');
  
  // Test clear history
  historyStorage.clearSearchHistory();
  const cleared = historyStorage.getSearchHistory();
  console.log('Clear history:', cleared.length === 0 ? '✓' : '✗');
  
  return history && afterRemove && cleared;
}

/**
 * Run all tests
 */
export function runAllTests() {
  console.log('=== Running Storage System Tests ===\n');
  
  const results = {
    basicStorage: testBasicStorage(),
    authStorage: testAuthStorage(),
    cacheStorage: testCacheStorage(),
    formStorage: testFormStorage(),
    preferencesStorage: testPreferencesStorage(),
    historyStorage: testHistoryStorage()
  };
  
  console.log('\n=== Test Results ===');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${test}: ${passed ? '✓ PASSED' : '✗ FAILED'}`);
  });
  
  const allPassed = Object.values(results).every(r => r);
  console.log(`\nOverall: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
  
  return results;
}

/**
 * Get storage statistics
 */
export function getStorageStats() {
  return {
    totalSize: storage.getStorageSize(),
    totalKeys: storage.getAllKeys().length,
    cacheStats: cacheStorage.getStats(),
    historyStats: historyStorage.getHistoryStats(),
    isAvailable: storage.isAvailable
  };
}

/**
 * Clear all test data
 */
export function clearTestData() {
  console.log('Clearing test data...');
  
  // Clear test items
  storage.removeItem('test_key');
  cacheStorage.remove('test_cache');
  formStorage.deleteDraft('test_form');
  
  console.log('Test data cleared ✓');
}

// Export for console testing
if (typeof window !== 'undefined') {
  window.storageTest = {
    runAllTests,
    testBasicStorage,
    testAuthStorage,
    testCacheStorage,
    testFormStorage,
    testPreferencesStorage,
    testHistoryStorage,
    getStorageStats,
    clearTestData
  };
  
  console.log('Storage test utilities loaded. Run window.storageTest.runAllTests() to test.');
}
