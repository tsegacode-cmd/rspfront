import { createContext, useContext, useEffect, useState } from 'react'
import { siteContentAPI } from '../services/api'
import { DEFAULT_ROLE_HIDDEN_MENUS, SITE_ACCOUNT_ROLES } from '../utils/siteMenuVisibility'

export const SITE_CONTENT_STORAGE_KEY = 'redsea_site_content_update'

const DEFAULT_ACCOUNT_ACCESS_RULES = SITE_ACCOUNT_ROLES.map(({ key, label }) => ({
  role: key,
  label,
  enabled: true,
  hiddenMenus: DEFAULT_ROLE_HIDDEN_MENUS[key] || [],
  hiddenRoutes: [],
  notes: '',
}))

export const DEFAULT_SITE_CONTENT = {
  headerTitle: 'REDSEA',
  headerTagline: 'Your trusted partner in commission work and brokerage services',
  loadingScreenTitle: 'REDSEA',
  installAppButtonText: 'Install REDSEA App',
  footerBrandTitle: 'REDSEA',
  footerDescription: 'Your trusted partner in commission work and brokerage services',
  servicesTitle: 'Services',
  services: ['Fixed Commission', 'Movable Commission', 'Brokerage Services'],
  contactTitle: 'Contact',
  email: 'info@redsea.com',
  phone: '+1 (555) 123-4567',
  copyrightText: 'All rights reserved. Commission Work & Brokerage Services fixed and movable.',
  termsAndConditions: 'Welcome to REDSEA.\n\nUse the platform respectfully and provide accurate information. Rewards, promotions, and claim-game settings are managed by REDSEA and may change over time. Do not use multiple accounts, automated tools, or other methods to manipulate rewards.\n\nETB rewards are credited according to the applicable reward rules. Coin rewards are separate from ETB wallet balances. Daily Claim games have per-game limits and rolling 24-hour cooldowns. Review the reward and cooldown shown in the app before playing.\n\nBookings, payment requests, products, and services are subject to availability and the payment terms shown at checkout. Optional delivery fees are separate from booking payments and are due on receipt when delivery is requested.\n\nBy using REDSEA, you agree to follow these terms and applicable laws. Contact REDSEA support if you have a question about your account or a reward.',
  accountAccessSettings: {
    enabled: true,
    rules: DEFAULT_ACCOUNT_ACCESS_RULES,
  }
}

const SiteContentContext = createContext(DEFAULT_SITE_CONTENT)

export function SiteContentProvider({ children }) {
  const [siteContent, setSiteContent] = useState(DEFAULT_SITE_CONTENT)

  useEffect(() => {
    let active = true
    siteContentAPI.get()
      .then(response => {
        if (active) setSiteContent({ ...DEFAULT_SITE_CONTENT, ...response.data })
      })
      .catch(error => {
        if (active) console.error('Could not load website content:', error)
      })

    const applyContentUpdate = content => {
      if (content) setSiteContent({ ...DEFAULT_SITE_CONTENT, ...content })
    }
    const handleContentUpdate = event => applyContentUpdate(event.detail)
    const handleStorageUpdate = event => {
      if (event.key !== SITE_CONTENT_STORAGE_KEY || !event.newValue) return
      try {
        applyContentUpdate(JSON.parse(event.newValue))
      } catch (error) {
        console.error('Could not apply website content update from another tab:', error)
      }
    }
    window.addEventListener('redsea:site-content-updated', handleContentUpdate)
    window.addEventListener('storage', handleStorageUpdate)

    return () => {
      active = false
      window.removeEventListener('redsea:site-content-updated', handleContentUpdate)
      window.removeEventListener('storage', handleStorageUpdate)
    }
  }, [])

  return (
    <SiteContentContext.Provider value={siteContent}>
      {children}
    </SiteContentContext.Provider>
  )
}

export function useSiteContent() {
  return useContext(SiteContentContext)
}
