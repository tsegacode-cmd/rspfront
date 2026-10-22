// Custom hook for staff list management across all pages
import { useState, useEffect } from 'react'
import { loadStaffList, getCachedStaffList } from '../utils/staffLoader'

export const useStaffList = (autoLoad = true) => {
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadStaff = async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    
    try {
      console.log('🔄 useStaffList: Loading staff...')
      
      // Try cached first for immediate response
      if (!forceRefresh) {
        const cached = getCachedStaffList()
        if (cached.length > 0) {
          console.log('✅ useStaffList: Using cached staff:', cached.length)
          setStaffList(cached)
          setLoading(false)
          return { success: true, data: cached, fromCache: true }
        }
      }
      
      // Load fresh data
      const result = await loadStaffList(forceRefresh)
      
      if (result.success) {
        setStaffList(result.data)
        console.log('✅ useStaffList: Staff loaded:', result.data.length)
      } else {
        setStaffList([])
        setError(result.message)
        console.log('❌ useStaffList: Failed to load staff:', result.message)
      }
      
      return result
    } catch (err) {
      const errorMsg = err.message || 'Failed to load staff list'
      setError(errorMsg)
      setStaffList([])
      console.error('❌ useStaffList: Error:', errorMsg)
      return { success: false, message: errorMsg, data: [] }
    } finally {
      setLoading(false)
    }
  }

  // Auto-load on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      loadStaff()
      
      // Mobile-specific retry logic
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      if (isMobile) {
        console.log('📱 useStaffList: Mobile detected, setting up retries...')
        
        // Retry after 3 seconds if no staff loaded
        const retryTimer1 = setTimeout(() => {
          if (staffList.length === 0) {
            console.log('🔄 useStaffList: Mobile retry 1...')
            loadStaff()
          }
        }, 3000)
        
        // Another retry after 6 seconds
        const retryTimer2 = setTimeout(() => {
          if (staffList.length === 0) {
            console.log('🔄 useStaffList: Mobile retry 2...')
            loadStaff()
          }
        }, 6000)
        
        return () => {
          clearTimeout(retryTimer1)
          clearTimeout(retryTimer2)
        }
      }
    }
  }, [autoLoad])

  return {
    staffList,
    loading,
    error,
    loadStaff,
    refresh: () => loadStaff(true),
    hasStaff: staffList.length > 0
  }
}

export default useStaffList