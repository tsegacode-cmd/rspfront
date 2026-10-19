/**
 * Authentication Storage Service
 * Handles JWT tokens and authentication state
 */

import { storage } from '../utils/storage.js';
import { encrypt, decrypt } from '../utils/encryption.js';

const AUTH_TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_DATA_KEY = 'user_data';
const TOKEN_EXPIRY_KEY = 'token_expiry';

class AuthStorageService {
  /**
   * Store authentication token
   */
  setToken(token, expiresIn = 3600) {
    const encrypted = encrypt(token);
    if (encrypted) {
      storage.setItem(AUTH_TOKEN_KEY, encrypted);
      const expiryTime = Date.now() + (expiresIn * 1000);
      storage.setItem(TOKEN_EXPIRY_KEY, expiryTime);
      return true;
    }
    return false;
  }

  /**
   * Get authentication token
   */
  getToken() {
    const encrypted = storage.getItem(AUTH_TOKEN_KEY);
    if (!encrypted) return null;

    // Check if token is expired
    const expiry = storage.getItem(TOKEN_EXPIRY_KEY);
    if (expiry && Date.now() > expiry) {
      this.clearAuth();
      return null;
    }

    return decrypt(encrypted);
  }

  /**
   * Store refresh token
   */
  setRefreshToken(token) {
    const encrypted = encrypt(token);
    if (encrypted) {
      storage.setItem(REFRESH_TOKEN_KEY, encrypted);
      return true;
    }
    return false;
  }

  /**
   * Get refresh token
   */
  getRefreshToken() {
    const encrypted = storage.getItem(REFRESH_TOKEN_KEY);
    return encrypted ? decrypt(encrypted) : null;
  }

  /**
   * Store user data
   */
  setUserData(userData) {
    return storage.setItem(USER_DATA_KEY, userData);
  }

  /**
   * Get user data
   */
  getUserData() {
    return storage.getItem(USER_DATA_KEY);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    const token = this.getToken();
    return !!token;
  }

  /**
   * Clear all authentication data
   */
  clearAuth() {
    storage.removeItem(AUTH_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(USER_DATA_KEY);
    storage.removeItem(TOKEN_EXPIRY_KEY);
  }

  /**
   * Get token expiry time
   */
  getTokenExpiry() {
    return storage.getItem(TOKEN_EXPIRY_KEY);
  }

  /**
   * Check if token is about to expire (within 5 minutes)
   */
  isTokenExpiringSoon() {
    const expiry = this.getTokenExpiry();
    if (!expiry) return false;
    
    const fiveMinutes = 5 * 60 * 1000;
    return (expiry - Date.now()) < fiveMinutes;
  }
}

export const authStorage = new AuthStorageService();
