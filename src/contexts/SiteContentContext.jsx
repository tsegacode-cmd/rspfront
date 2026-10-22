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
  maintenanceEnabled: false,
  maintenanceMessage: 'We are performing scheduled maintenance. Please check back soon.',
  headerTitle: 'REDSEA',
  headerTagline: 'Your trusted partner in commission work and brokerage services',
  homePromotionsEyebrow: 'REDSEA OFFERS',
  homePromotionsTitle: 'Promotions',
  homePromotionsDescription: 'Featured updates and deals from our team',
  homeShowPromotionText: 'Show promotion',
  homeCoinBadge: 'VIRTUAL REWARDS',
  homeCoinTitle: 'Introducing RedSeaPro Coin',
  homeCoinDescription: 'Earn and use RedSeaPro Coins across the virtual rewards program.',
  homeCoinButtonText: 'Explore your wallet',
  homeCoinAriaLabel: 'Explore your RedSeaPro Coin virtual rewards in your wallet',
  homeCatalogEyebrow: 'DISCOVER REDSEA',
  homeCatalogTitle: 'Services & Products',
  homeCatalogDescription: 'Browse published listings across every service category.',
  homeSearchLabel: 'Search all services and products',
  homeSearchPlaceholder: 'Search listings, locations, providers...',
  homeClearSearchLabel: 'Clear search',
  homeFilterLabel: 'Filter products by category',
  homeAllCategoriesLabel: 'All',
  homeEmptyMessage: 'New products and services will appear here as they are published.',
  homeFeaturedTitle: 'Popular & sponsored',
  homeCommunityLinkText: 'See the community feed',
  homeSponsoredBadgeText: 'Sponsored',
  homeBoostedBadgeText: 'Boosted',
  homePinnedAlertText: 'Pinned alert',
  homeViewProductText: 'View product',
  homeNoResultsPrefix: 'No services or products match',
  homeCategoryTitles: {
    'broker-house': 'Broker & House',
    'create-partnership': 'Brokerage',
    'room-booking': 'Room Booking',
    logistics: 'Logistics',
    'movable-services': 'Big Service',
  },
  homeViewCategoryText: 'View category',
  footerEmailPrefix: 'Email',
  footerPhonePrefix: 'Phone',
  footerContactSupportText: 'Contact support',
  footerWhatsAppSupportText: 'WhatsApp support',
  footerTermsButtonText: 'Terms & Conditions',
  footerTermsTitle: 'Terms & Conditions',
  footerTermsUnavailableText: 'Terms and conditions are not available.',
  footerTermsCloseText: 'Close',
  loadingScreenTitle: 'REDSEA',
  installAppButtonText: 'Install REDSEA App',
  footerBrandTitle: 'REDSEA',
  footerDescription: 'Your trusted partner in commission work and brokerage services',
  servicesTitle: 'Services',
  services: ['Fixed Commission', 'Movable Commission', 'Brokerage Services'],
  contactTitle: 'Contact',
  contactPageTitle: 'Contact Us',
  contactPageSubtitle: 'Get in touch with our team',
  contactIntroTitle: 'Get In Touch',
  contactIntroText: "Have questions about our services? Want to discuss a potential partnership? We're here to help. Reach out to us using the contact form or through any of the methods below.",
  contactOfficeTitle: '📍 Office Location',
  contactOfficeDetails: '123 Business District\nRed Sea Plaza, Suite 500\nCity, State 12345',
  contactPhoneTitle: '📞 Phone',
  contactPhoneDetails: 'Main: +1 (555) 123-4567\nFax: +1 (555) 123-4568',
  contactEmailTitle: '📧 Email',
  contactEmailDetails: 'General: info@redsea.com\nSupport: support@redsea.com\nSales: sales@redsea.com',
  contactHoursTitle: '🕐 Business Hours',
  contactHoursDetails: 'Monday - Friday: 9:00 AM - 6:00 PM\nSaturday: 10:00 AM - 4:00 PM\nSunday: Closed',
  contactFormTitle: 'Send Us a Message',
  contactServiceOptions: ['Fixed Commission', 'Movable Commission', 'Brokerage Services', 'General Inquiry'],
  contactSendButtonText: 'Send Message',
  contactAboutTitle: 'About REDSEA',
  contactAboutParagraphOne: 'REDSEA is a leading platform for commission work and brokerage services. We specialize in connecting businesses and individuals through our comprehensive fixed commission, movable commission, and brokerage service offerings.',
  contactAboutParagraphTwo: 'With years of experience in the industry, our team is dedicated to providing transparent, efficient, and professional services that help our clients achieve their business goals. Whether you are looking for stable fixed commission structures, performance-based movable commissions, or expert brokerage services, REDSEA is your trusted partner.',
  email: 'info@redsea.com',
  phone: '+1 (555) 123-4567',
  copyrightYear: '2024',
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
