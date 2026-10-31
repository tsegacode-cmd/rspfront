import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { PreferencesProvider } from './contexts/PreferencesContext.jsx'
import './index.css'
import './Responsive.css'
import './ThemeOverrides.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(error => {
      console.error('Service worker registration failed:', error)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </ErrorBoundary>
)
