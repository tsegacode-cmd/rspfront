// Utility to clear page state on reload
// This ensures that when users reload the page, all filters and selections are reset

export const clearPageStateOnReload = (pageName) => {
  // Check if this is a page reload (not a navigation)
  const isReload = performance.navigation.type === performance.navigation.TYPE_RELOAD ||
                   performance.getEntriesByType('navigation')[0]?.type === 'reload'
  
  if (isReload) {
    console.log(`🔄 Page reload detected for ${pageName} - Clearing state`)
    
    // Clear any page-specific state from sessionStorage
    const keysToRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(`${pageName}_`)) {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => {
      sessionStorage.removeItem(key)
      console.log(`  ✓ Cleared: ${key}`)
    })
    
    return true
  }
  
  return false
}

// Clear all page states
export const clearAllPageStates = () => {
  const pages = ['PayRegistration', 'Unpaid', 'Paid', 'Result', 'Registered']
  
  pages.forEach(pageName => {
    const keysToRemove = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key && key.startsWith(`${pageName}_`)) {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => sessionStorage.removeItem(key))
  })
  
  console.log('🧹 All page states cleared')
}
