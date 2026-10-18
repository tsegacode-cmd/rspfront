/**
 * User Permissions Utility
 * 
 * This utility provides functions to check user permissions for menus, tabs, buttons, and icons.
 * Permissions are stored in localStorage per user and loaded on login.
 */

/**
 * Get current user's permissions from localStorage
 * @returns {Object} User permissions object
 */
export const getCurrentUserPermissions = () => {
  try {
    const permissionsStr = localStorage.getItem('currentUserPermissions')
    if (!permissionsStr) {
      // Return default permissions if none found
      return getDefaultPermissions()
    }
    return JSON.parse(permissionsStr)
  } catch (error) {
    console.error('Error loading user permissions:', error)
    return getDefaultPermissions()
  }
}

/**
 * Get default permissions in secure default-deny mode.
 * Missing, null, or undefined permissions are denied until an explicit grant is present.
 * @returns {Object} Default permissions object
 */
export const getDefaultPermissions = () => {
  return {
    menus: {
      home: false,
      dataCollector: false,
      fixedCommission: false,
      movableCommission: false,
      brokerage: false,
      contact: false
    },
    tabs: {
      dataRegistration: false,
      randomPiadRegister: false,
      scanner: false,
      payRegistration: false,
      unpaid: false,
      paid: false,
      needApproval: false,
      registered: false,
      result: false,
      paidRandomDataForm: false
    },
    resultPage: {
      enabled: false,
      allowedUsers: []
    },
    cards: {
      statistics: false,
      quickActions: false,
      recentActivity: false
    },
    lists: {
      viewList: false,
      editList: false,
      deleteList: false,
      exportList: false
    },
    buttons: {
      create: false,
      edit: false,
      delete: false,
      download: false,
      print: false,
      approve: false
    },
    icons: {
      showIcons: false,
      actionIcons: false,
      profileIcon: 'invisible',
      editIcon: 'invisible',
      deleteIcon: 'invisible',
      updateIcon: 'invisible',
      viewIcon: 'invisible',
      downloadIcon: 'invisible',
      printIcon: 'invisible',
      approveIcon: 'invisible',
      rejectIcon: 'invisible'
    }
  }
}

const hasExplicitTruePermission = (permissions, key) => {
  if (!permissions || typeof permissions !== 'object') return false
  return permissions[key] === true
}

/**
 * Check if user can access a specific menu
 * @param {string} menuName - Name of the menu (home, dataCollector, fixedCommission, etc.)
 * @returns {boolean} True if user can access the menu
 */
export const canAccessMenu = (menuName) => {
  const permissions = getCurrentUserPermissions()
  return hasExplicitTruePermission(permissions.menus, menuName)
}

/**
 * Check if user can access a specific tab
 * @param {string} tabName - Name of the tab (dataRegistration, payRegistration, etc.)
 * @returns {boolean} True if user can access the tab
 */
export const canAccessTab = (tabName) => {
  const permissions = getCurrentUserPermissions()
  return hasExplicitTruePermission(permissions.tabs, tabName)
}

/**
 * Check if user can use a specific button
 * @param {string} buttonName - Name of the button (create, edit, delete, etc.)
 * @returns {boolean} True if user can use the button
 */
export const canUseButton = (buttonName) => {
  const permissions = getCurrentUserPermissions()
  return hasExplicitTruePermission(permissions.buttons, buttonName)
}

/**
 * Get icon visibility state
 * @param {string} iconName - Name of the icon (profileIcon, editIcon, deleteIcon, etc.)
 * @returns {string} Icon state: 'visible', 'disabled', or 'invisible'
 */
export const getIconVisibility = (iconName) => {
  const permissions = getCurrentUserPermissions()
  return permissions?.icons?.[iconName] ?? 'invisible'
}

/**
 * Check if user can view lists
 * @returns {boolean} True if user can view lists
 */
export const canViewList = () => {
  const permissions = getCurrentUserPermissions()
  return permissions?.lists?.viewList === true
}

/**
 * Check if user can edit lists
 * @returns {boolean} True if user can edit lists
 */
export const canEditList = () => {
  const permissions = getCurrentUserPermissions()
  return permissions?.lists?.editList === true
}

/**
 * Check if user can delete from lists
 * @returns {boolean} True if user can delete from lists
 */
export const canDeleteList = () => {
  const permissions = getCurrentUserPermissions()
  return permissions?.lists?.deleteList === true
}

/**
 * Check if user can export lists
 * @returns {boolean} True if user can export lists
 */
export const canExportList = () => {
  const permissions = getCurrentUserPermissions()
  return permissions?.lists?.exportList === true
}

/**
 * Check if user can see a specific card
 * @param {string} cardName - Name of the card (statistics, quickActions, recentActivity)
 * @returns {boolean} True if user can see the card
 */
export const canSeeCard = (cardName) => {
  const permissions = getCurrentUserPermissions()
  return permissions?.cards?.[cardName] === true
}

/**
 * Check if Result page user dropdown is enabled
 * @returns {boolean} True if enabled (show dropdown), false if disabled (show only self)
 */
export const isResultPageDropdownEnabled = () => {
  const permissions = getCurrentUserPermissions()
  return permissions?.resultPage?.enabled === true
}

/**
 * Get list of user IDs that current user can view in Result page
 * @returns {Array} Array of user IDs
 */
export const getAllowedResultUsers = () => {
  const permissions = getCurrentUserPermissions()
  return Array.isArray(permissions?.resultPage?.allowedUsers) ? permissions.resultPage.allowedUsers : []
}

/**
 * Check if icons should be shown at all
 * @returns {boolean} True if icons should be shown
 */
export const shouldShowIcons = () => {
  const permissions = getCurrentUserPermissions()
  return permissions?.icons?.showIcons === true
}

/**
 * Check if action icons are enabled
 * @returns {boolean} True if action icons are enabled
 */
export const areActionIconsEnabled = () => {
  const permissions = getCurrentUserPermissions()
  return permissions?.icons?.actionIcons === true
}

/**
 * Save permissions for current user
 * @param {Object} permissions - Permissions object to save
 */
export const saveCurrentUserPermissions = (permissions) => {
  try {
    localStorage.setItem('currentUserPermissions', JSON.stringify(permissions))
    console.log('✅ User permissions saved to localStorage')
  } catch (error) {
    console.error('Error saving user permissions:', error)
  }
}

/**
 * Clear current user permissions (on logout)
 */
export const clearCurrentUserPermissions = () => {
  localStorage.removeItem('currentUserPermissions')
  console.log('🗑️ User permissions cleared')
}

/**
 * Refresh current user's permissions from server
 * @returns {Promise<Object>} Updated permissions object
 */
export const refreshUserPermissions = async () => {
  try {
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'
    const authToken = localStorage.getItem('authToken')
    
    if (!authToken) {
      console.warn('⚠️ No auth token found, cannot refresh permissions')
      return null
    }

    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    })

    if (!response.ok) {
      throw new Error('Failed to fetch user data')
    }

    const data = await response.json()
    
    if (data.success && data.data && data.data.permissions) {
      const newPermissions = data.data.permissions
      
      // Check if permissions have changed
      const currentPermissions = getCurrentUserPermissions()
      const permissionsChanged = JSON.stringify(currentPermissions) !== JSON.stringify(newPermissions)
      
      if (permissionsChanged) {
        console.log('🔄 Permissions updated from server')
        saveCurrentUserPermissions(newPermissions)
        
        // Dispatch custom event to notify components
        window.dispatchEvent(new CustomEvent('permissionsUpdated', { 
          detail: { permissions: newPermissions } 
        }))
        
        return newPermissions
      } else {
        console.log('✅ Permissions are up to date')
        return currentPermissions
      }
    }
    
    return null
  } catch (error) {
    console.error('❌ Error refreshing permissions:', error)
    return null
  }
}

/**
 * Start polling for permission updates
 * @param {number} intervalMs - Polling interval in milliseconds (default: 30000 = 30 seconds)
 * @returns {number} Interval ID that can be used to stop polling
 */
export const startPermissionPolling = (intervalMs = 30000) => {
  console.log(`🔄 Starting permission polling (every ${intervalMs / 1000}s)`)
  
  // Initial refresh
  refreshUserPermissions()
  
  // Set up polling
  const intervalId = setInterval(() => {
    refreshUserPermissions()
  }, intervalMs)
  
  return intervalId
}

/**
 * Stop polling for permission updates
 * @param {number} intervalId - Interval ID returned by startPermissionPolling
 */
export const stopPermissionPolling = (intervalId) => {
  if (intervalId) {
    clearInterval(intervalId)
    console.log('🛑 Permission polling stopped')
  }
}
