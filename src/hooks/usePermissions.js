import { useState, useEffect } from 'react'
import { 
  getCurrentUserPermissions, 
  startPermissionPolling, 
  stopPermissionPolling,
  refreshUserPermissions 
} from '../utils/permissions'

/**
 * Custom hook to manage user permissions with automatic refresh
 * @param {boolean} enablePolling - Whether to enable automatic polling (default: true)
 * @param {number} pollingInterval - Polling interval in milliseconds (default: 30000 = 30 seconds)
 * @returns {Object} { permissions, refreshPermissions, isRefreshing }
 */
export const usePermissions = (enablePolling = true, pollingInterval = 30000) => {
  const [permissions, setPermissions] = useState(getCurrentUserPermissions())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Manual refresh function
  const refreshPermissions = async () => {
    setIsRefreshing(true)
    try {
      const newPermissions = await refreshUserPermissions()
      if (newPermissions) {
        setPermissions(newPermissions)
      }
    } catch (error) {
      console.error('Failed to refresh permissions:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    // Listen for permission updates
    const handlePermissionsUpdated = (event) => {
      console.log('🔔 Permissions updated event received')
      setPermissions(event.detail.permissions)
    }

    window.addEventListener('permissionsUpdated', handlePermissionsUpdated)

    // Start polling if enabled
    let intervalId = null
    if (enablePolling) {
      intervalId = startPermissionPolling(pollingInterval)
    }

    // Cleanup
    return () => {
      window.removeEventListener('permissionsUpdated', handlePermissionsUpdated)
      if (intervalId) {
        stopPermissionPolling(intervalId)
      }
    }
  }, [enablePolling, pollingInterval])

  return {
    permissions,
    refreshPermissions,
    isRefreshing
  }
}

export default usePermissions
