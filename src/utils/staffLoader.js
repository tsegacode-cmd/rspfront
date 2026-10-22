// Global Staff Loading Utility for Mobile Support
import { userAPI, rootAPI } from '../services/api'

// Global staff cache
let staffCache = null
let staffCacheTime = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Get multiple API URLs for mobile fallback
const getApiUrls = () => {
  const hostname = window.location.hostname
  const networkIP = import.meta.env.VITE_NETWORK_IP || '192.168.98.195'
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '5000'
  
  return [
    // Current hostname
    `http://${hostname}:${backendPort}/api/v1`,
    // Known working IP
    `http://${networkIP}:${backendPort}/api/v1`,
    // Localhost fallback
    'http://localhost:5000/api/v1',
    'http://127.0.0.1:5000/api/v1'
  ].filter(url => !url.includes('undefined'))
}

// Mobile-optimized staff loading function
export const loadStaffList = async (forceRefresh = false) => {
  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh && staffCache && staffCacheTime && (Date.now() - staffCacheTime < CACHE_DURATION)) {
      console.log('✅ Using cached staff list:', staffCache.length, 'staff members')
      return {
        success: true,
        data: staffCache,
        fromCache: true
      }
    }

    console.log('🔄 Loading fresh staff list...')
    console.log('🌐 Current hostname:', window.location.hostname)
    console.log('📱 User agent:', navigator.userAgent)
    
    let response = null
    let lastError = null
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    
    // Strategy 1: Try API wrappers first (they have their own fallbacks now)
    try {
      console.log('🔄 Strategy 1: rootAPI.getUsers()...')
      response = await rootAPI.getUsers()
      if (response && response.success && response.data && Array.isArray(response.data)) {
        console.log('✅ Strategy 1 succeeded:', response.data.length, 'staff members')
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.log('❌ Strategy 1 failed:', error.message)
      lastError = error
      
      // Strategy 2: Try userAPI
      try {
        console.log('🔄 Strategy 2: userAPI.getAllUsers()...')
        response = await userAPI.getAllUsers()
        if (response && response.success && response.data && Array.isArray(response.data)) {
          console.log('✅ Strategy 2 succeeded:', response.data.length, 'staff members')
        } else {
          throw new Error('Invalid response format')
        }
      } catch (error2) {
        console.log('❌ Strategy 2 failed:', error2.message)
        lastError = error2
        
        // Strategy 3: Direct API calls with multiple URLs (mobile fallback)
        const token = localStorage.getItem('rootToken') || localStorage.getItem('authToken')
        const apiUrls = getApiUrls()
        const endpoints = ['/root/users', '/users']
        
        let directSuccess = false
        
        for (const apiUrl of apiUrls) {
          if (directSuccess) break
          
          for (const endpoint of endpoints) {
            try {
              console.log(`🔄 Strategy 3: Direct fetch to ${apiUrl}${endpoint}`)
              
              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 10000)
              
              const directResponse = await fetch(`${apiUrl}${endpoint}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token && { 'Authorization': `Bearer ${token}` })
                },
                signal: controller.signal
              })
              
              clearTimeout(timeoutId)
              
              if (directResponse.ok) {
                const directData = await directResponse.json()
                if (directData && directData.success && directData.data && Array.isArray(directData.data)) {
                  console.log(`✅ Strategy 3 succeeded with ${apiUrl}${endpoint}:`, directData.data.length, 'staff members')
                  response = directData
                  directSuccess = true
                  break
                }
              }
            } catch (directError) {
              console.log(`❌ Direct fetch failed for ${apiUrl}${endpoint}:`, directError.message)
              continue
            }
          }
        }
        
        if (!directSuccess) {
          console.log('❌ All direct fetch attempts failed')
        }
      }
    }
    
    // Check final response
    if (response && response.success && response.data && Array.isArray(response.data)) {
      // Cache the successful response
      staffCache = response.data
      staffCacheTime = Date.now()
      
      console.log('✅ Staff list loaded successfully:', response.data.length, 'staff members')
      return {
        success: true,
        data: response.data,
        fromCache: false
      }
    } else {
      console.log('❌ All strategies failed. Last error:', lastError)
      return {
        success: false,
        message: lastError?.message || 'Failed to load staff list - check network connection',
        data: []
      }
    }
    
  } catch (error) {
    console.error('❌ Critical error in loadStaffList:', error)
    return {
      success: false,
      message: error.message || 'Critical error loading staff list',
      data: []
    }
  }
}

// Get cached staff list (synchronous)
export const getCachedStaffList = () => {
  if (staffCache && staffCacheTime && (Date.now() - staffCacheTime < CACHE_DURATION)) {
    return staffCache
  }
  return []
}

// Clear staff cache
export const clearStaffCache = () => {
  staffCache = null
  staffCacheTime = null
}

// Preload staff list (can be called on app startup)
export const preloadStaffList = async () => {
  try {
    await loadStaffList()
    console.log('✅ Staff list preloaded')
  } catch (error) {
    console.log('❌ Staff list preload failed:', error.message)
  }
}

export default {
  loadStaffList,
  getCachedStaffList,
  clearStaffCache,
  preloadStaffList
}