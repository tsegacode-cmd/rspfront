import { useState, useEffect } from 'react'

function Debug() {
  const [authStatus, setAuthStatus] = useState({})
  const [apiStatus, setApiStatus] = useState({})

  useEffect(() => {
    // Check authentication status
    const authToken = localStorage.getItem('authToken')
    const userData = localStorage.getItem('userData')
    const rootToken = localStorage.getItem('rootToken')
    
    setAuthStatus({
      authToken: authToken ? 'EXISTS' : 'MISSING',
      userData: userData ? 'EXISTS' : 'MISSING',
      rootToken: rootToken ? 'EXISTS' : 'MISSING',
      userDataContent: userData ? JSON.parse(userData) : null
    })

    // Test API connectivity
    const testAPI = async () => {
      try {
        const response = await fetch('http://192.168.98.195:5000/api/v1/health')
        const data = await response.json()
        setApiStatus({
          status: 'SUCCESS',
          data: data,
          url: 'http://192.168.98.195:5000/api/v1/health'
        })
      } catch (error) {
        setApiStatus({
          status: 'ERROR',
          error: error.message,
          url: 'http://192.168.98.195:5000/api/v1/health'
        })
      }
    }

    testAPI()
  }, [])

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>🔍 Debug Information</h1>
      
      <div style={{ marginBottom: '30px' }}>
        <h2>🔐 Authentication Status</h2>
        <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px' }}>
          <p><strong>Auth Token:</strong> {authStatus.authToken}</p>
          <p><strong>User Data:</strong> {authStatus.userData}</p>
          <p><strong>Root Token:</strong> {authStatus.rootToken}</p>
          {authStatus.userDataContent && (
            <details>
              <summary>User Data Content</summary>
              <pre>{JSON.stringify(authStatus.userDataContent, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h2>🌐 API Connectivity</h2>
        <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px' }}>
          <p><strong>Status:</strong> {apiStatus.status}</p>
          <p><strong>URL:</strong> {apiStatus.url}</p>
          {apiStatus.data && (
            <details>
              <summary>API Response</summary>
              <pre>{JSON.stringify(apiStatus.data, null, 2)}</pre>
            </details>
          )}
          {apiStatus.error && (
            <p style={{ color: 'red' }}><strong>Error:</strong> {apiStatus.error}</p>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <h2>🌍 Environment Info</h2>
        <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '5px' }}>
          <p><strong>Current URL:</strong> {window.location.href}</p>
          <p><strong>Hostname:</strong> {window.location.hostname}</p>
          <p><strong>Port:</strong> {window.location.port}</p>
          <p><strong>User Agent:</strong> {navigator.userAgent}</p>
        </div>
      </div>

      <div>
        <h2>🔧 Quick Actions</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => localStorage.clear()}
            style={{ padding: '10px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            🗑️ Clear All Storage
          </button>
          <button 
            onClick={() => window.location.href = '/login'}
            style={{ padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            🔐 Go to Login
          </button>
          <button 
            onClick={() => window.location.href = '/'}
            style={{ padding: '10px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            🏠 Go to Home
          </button>
          <button 
            onClick={() => window.location.reload()}
            style={{ padding: '10px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px' }}
          >
            🔄 Reload Page
          </button>
        </div>
      </div>
    </div>
  )
}

export default Debug