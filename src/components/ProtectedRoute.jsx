import { Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'

function ProtectedRoute({ children }) {
  const [isChecking, setIsChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check authentication status
    const checkAuth = () => {
      try {
        const authToken = localStorage.getItem('authToken')
        const userData = localStorage.getItem('userData')
        
        console.log('🔐 ProtectedRoute Check:')
        console.log('Auth Token:', authToken ? 'EXISTS' : 'MISSING')
        console.log('User Data:', userData ? 'EXISTS' : 'MISSING')
        
        const authenticated = !!(authToken && userData)
        setIsAuthenticated(authenticated)
        
        if (authenticated) {
          console.log('✅ Authenticated - Rendering protected content')
        } else {
          console.log('❌ Not authenticated - Will redirect to /login')
        }
      } catch (error) {
        console.error('❌ Error checking authentication:', error)
        setIsAuthenticated(false)
      } finally {
        setIsChecking(false)
      }
    }

    checkAuth()
  }, [])

  // Show loading while checking authentication
  if (isChecking) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e3e3e3',
            borderTop: '4px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p>🔐 Checking authentication...</p>
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    )
  }
  
  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  // If authenticated, render the children components
  return children
}

export default ProtectedRoute
