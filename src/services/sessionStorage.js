/**
 * Session Storage Service
 * Manages user session data and activity tracking
 */

import { storage } from '../utils/storage.js';

const SESSION_KEY = 'user_session';
const LAST_ACTIVITY_KEY = 'last_activity';
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

class SessionStorageService {
  /**
   * Initialize or update session
   */
  initSession(sessionData = {}) {
    const session = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      lastActivity: Date.now(),
      ...sessionData
    };
    
    storage.setItem(SESSION_KEY, session);
    this.updateActivity();
    return session;
  }

  /**
   * Get current session
   */
  getSession() {
    const session = storage.getItem(SESSION_KEY);
    
    if (!session) return null;

    // Check if session is expired
    if (this.isSessionExpired()) {
      this.clearSession();
      return null;
    }

    return session;
  }

  /**
   * Update session data
   */
  updateSession(data) {
    const session = this.getSession();
    if (!session) return false;

    const updatedSession = {
      ...session,
      ...data,
      lastActivity: Date.now()
    };

    storage.setItem(SESSION_KEY, updatedSession);
    this.updateActivity();
    return true;
  }

  /**
   * Update last activity timestamp
   */
  updateActivity() {
    storage.setItem(LAST_ACTIVITY_KEY, Date.now());
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity() {
    return storage.getItem(LAST_ACTIVITY_KEY);
  }

  /**
   * Check if session is expired
   */
  isSessionExpired() {
    const lastActivity = this.getLastActivity();
    if (!lastActivity) return true;

    return (Date.now() - lastActivity) > SESSION_TIMEOUT;
  }

  /**
   * Clear session
   */
  clearSession() {
    storage.removeItem(SESSION_KEY);
    storage.removeItem(LAST_ACTIVITY_KEY);
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get session duration
   */
  getSessionDuration() {
    const session = this.getSession();
    if (!session) return 0;

    return Date.now() - session.startTime;
  }

  /**
   * Check if session is active
   */
  isSessionActive() {
    return !this.isSessionExpired() && !!this.getSession();
  }
}

export const sessionStorage = new SessionStorageService();
