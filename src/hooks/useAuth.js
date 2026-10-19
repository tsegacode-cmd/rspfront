/**
 * useAuth Hook
 * React hook for authentication state management
 */

import { useState, useEffect, useCallback } from 'react';
import { authStorage } from '../services/authStorage.js';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(authStorage.isAuthenticated());
  const [user, setUser] = useState(authStorage.getUserData());
  const [token, setToken] = useState(authStorage.getToken());

  // Login function
  const login = useCallback((authToken, userData, expiresIn) => {
    authStorage.setToken(authToken, expiresIn);
    authStorage.setUserData(userData);
    
    setIsAuthenticated(true);
    setUser(userData);
    setToken(authToken);
    
    return true;
  }, []);

  // Logout function
  const logout = useCallback(() => {
    authStorage.clearAuth();
    
    setIsAuthenticated(false);
    setUser(null);
    setToken(null);
  }, []);

  // Update user data
  const updateUser = useCallback((userData) => {
    authStorage.setUserData(userData);
    setUser(userData);
  }, []);

  // Refresh token
  const refreshToken = useCallback((newToken, expiresIn) => {
    authStorage.setToken(newToken, expiresIn);
    setToken(newToken);
  }, []);

  // Check token expiration
  useEffect(() => {
    const checkTokenExpiration = () => {
      if (authStorage.isTokenExpiringSoon()) {
        // Token is expiring soon, you might want to refresh it
        console.warn('Token is expiring soon');
      }
      
      if (!authStorage.isAuthenticated()) {
        logout();
      }
    };

    // Check every minute
    const interval = setInterval(checkTokenExpiration, 60000);

    return () => clearInterval(interval);
  }, [logout]);

  return {
    isAuthenticated,
    user,
    token,
    login,
    logout,
    updateUser,
    refreshToken
  };
}
