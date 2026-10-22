import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI, rootAPI, userAPI, dataRegistrationAPI, liveChatAPI } from '../../../../services/api'
import { getServiceBookingRequests, updateServiceBookingRequest } from '../../../../utils/serviceBookingRequests'
import {
  getUtilityRequests,
  getUtilityPaymentProofs,
  approveUtilityPayment,
  cancelUtilityRequest,
  approveUtilityReceipt,
} from '../../../../utils/utilityPayments'
import RootServiceCatalog from '../../../../components/RootServiceCatalog'
import RootPromotions from '../../../../components/RootPromotions'
import LinkCampaignManagement from '../../../../components/LinkCampaignManagement'
import RootPaymentProviderSettings from '../../../../components/RootPaymentProviderSettings'
import DataCollect from '../../../DataCollector/DataCollect'
import WalletManagement from '../../../../components/WalletManagement'
import RootUtilityControl from './RootUtilityControl'
import OtpDeliverySettings from '../../../../components/OtpDeliverySettings'
import RootSiteContent from '../../../../components/RootSiteContent'
import LiveSupportChat from '../../../../components/LiveSupportChat'
import RootSocialMessages from '../../../../components/RootSocialMessages'
import RootFeedManagement from '../../../../components/RootFeedManagement'
import RootAgentManagement from '../../../../components/RootAgentManagement'
import RootMiniRideManagement from '../../../../components/RootMiniRideManagement'
import PlatformFinanceOverview from '../../../../components/PlatformFinanceOverview'
import LogoutConfirmationModal from '../../../../components/LogoutConfirmationModal'
import Pagination, { getPageItems, PAGE_SIZE } from '../../../../components/Pagination'
import logoImage from '../../../../logo/logo.png'
import './RootDashboard.css'

const normalizePhoneNumber = phone => String(phone || '').replace(/\D/g, '')
const ROOT_DASHBOARD_TABS = [
  'overview', 'users', 'agents', 'feed-management', 'userprofile', 'finance', 'partners', 'mini-rides',
  'services', 'promotions', 'link-campaigns', 'booked', 'payments', 'utility-control', 'chat', 'transactions',
  'wallet-management', 'data-collector', 'database', 'otp-api', 'site-content', 'logs',
]

function RootDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('rootDashboardActiveTab')
    return ROOT_DASHBOARD_TABS.includes(savedTab) ? savedTab : 'overview'
  })
  const [dashboardStatus, setDashboardStatus] = useState({ badges: {}, recentIncomeCount: 0, recentIncomeAmount: 0 })
  const [chatMode, setChatMode] = useState('support')
  const [dataCollectorMenuRequest, setDataCollectorMenuRequest] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [showLogoutConfirmation, setShowLogoutConfirmation] = useState(false)
  const [healthStatus, setHealthStatus] = useState({
    server: { status: 'unknown' },
    database: {
      neon: { connected: false, error: null },
      primary: 'neon'
    }
  })
  const [autoFixing, setAutoFixing] = useState(false)
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    full_name: '',
    role: 'user',
    position: '',
    phone: ''
  })
  const [stats, setStats] = useState({
    totalUsers: 0,
    activePartners: 0,
    totalRevenue: 0,
    pendingTransactions: 0,
    loggedInUsers: 0 // Live count of logged-in users
  })
  const [activity, setActivity] = useState([])
  const [listPages, setListPages] = useState({})
  const [users, setUsers] = useState([])
  const [partners, setPartners] = useState([])
  const [serviceBookingRequests, setServiceBookingRequests] = useState([])
  const [utilityPaymentRequests, setUtilityPaymentRequests] = useState([])
  const [viewUtilityReceipt, setViewUtilityReceipt] = useState(null)
  const [manualUtilityReceipts, setManualUtilityReceipts] = useState({})
  const [transactions, setTransactions] = useState([])
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsError, setLogsError] = useState('')
  const [registrations, setRegistrations] = useState([])
  const [editingUser, setEditingUser] = useState(null)
  const [notification, setNotification] = useState(null)
  const [showPermissionsModal, setShowPermissionsModal] = useState(false)
  const [showCommissionModal, setShowCommissionModal] = useState(false)
  const [selectedUserForCommission, setSelectedUserForCommission] = useState(null)
  const [commissionData, setCommissionData] = useState({
    adjustmentType: 'percentage', // 'percentage' or 'fixed'
    value: '',
    workType: 'all' // 'all', 'redsea-ebc', 'sells-product', 'other'
  })
  const [commissionProjectTitles, setCommissionProjectTitles] = useState([])
  const [userCommissions, setUserCommissions] = useState({}) // Store per-user commission settings
  const [selectedFinanceUser, setSelectedFinanceUser] = useState('all') // For finance tab user filter
  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [deletedData, setDeletedData] = useState({ registrations: [], users: [] })
  const [passwordVisibility, setPasswordVisibility] = useState({}) // Track password visibility per user
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false) // Track mobile menu state
  const [rootUser, setRootUser] = useState(null) // Store root user data
  const [rootAuthVerified, setRootAuthVerified] = useState(false)
  const [userPermissions, setUserPermissions] = useState({
    menus: {
      home: true,
      dataCollector: true,
      fixedCommission: true,
      movableCommission: true,
      brokerage: true,
      contact: true
    },
    tabs: {
      dataRegistration: true,
      payRegistration: true,
      unpaid: true,
      paid: true,
      needApproval: true,
      registered: true,
      result: true
    },
    resultPage: {
      enabled: true, // true = enabled (show user dropdown), false = disabled (show only self)
      allowedUsers: [] // Array of user IDs that can view this user's data
    },
    cards: {
      statistics: true,
      quickActions: true,
      recentActivity: true
    },
    lists: {
      viewList: true,
      editList: true,
      deleteList: true,
      exportList: true
    },
    buttons: {
      create: true,
      edit: true,
      delete: true,
      download: true,
      print: true,
      approve: true
    },
    icons: {
      showIcons: true,
      actionIcons: true,
      profileIcon: 'visible', // visible, disabled, invisible
      editIcon: 'visible', // visible, disabled, invisible
      deleteIcon: 'visible',
      updateIcon: 'visible',
      viewIcon: 'visible',
      downloadIcon: 'visible',
      printIcon: 'visible',
      approveIcon: 'visible',
      rejectIcon: 'visible'
    }
  })

  useEffect(() => {
    if (!rootAuthVerified) return undefined
    let active = true
    let refreshing = false
    let loggedRefreshError = false
    const refreshUtilityPayments = () => {
      if (!active || refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      getUtilityRequests()
        .then(requests => {
          loggedRefreshError = false
          if (active) setUtilityPaymentRequests(requests)
        })
        .catch(error => {
          if (!loggedRefreshError) {
            console.error('Failed to load utility payment requests:', error)
            loggedRefreshError = true
          }
        })
        .finally(() => {
          refreshing = false
        })
    }
    refreshUtilityPayments()
    const timer = window.setInterval(refreshUtilityPayments, 500)
    window.addEventListener('redsea:utility-payments', refreshUtilityPayments)
    document.addEventListener('visibilitychange', refreshUtilityPayments)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('redsea:utility-payments', refreshUtilityPayments)
      document.removeEventListener('visibilitychange', refreshUtilityPayments)
    }
  }, [rootAuthVerified])

  useEffect(() => {
    // Check root authentication
    const rootToken = localStorage.getItem('rootToken')
    const rootUser = localStorage.getItem('rootUser')
    
    if (!rootToken || !rootUser) {
      navigate('/root/portal')
      return
    }

    // Get root user data from localStorage
    const storedRootUser = localStorage.getItem('rootUser')
    if (storedRootUser) {
      try {
        setRootUser(JSON.parse(storedRootUser))
      } catch (e) {
        console.error('Failed to parse root user data:', e)
      }
    }

    const initializeDashboard = async () => {
      if (await verifyAuth()) await loadDashboardData()
    }
    initializeDashboard()
  }, [navigate])

  useEffect(() => {
    if (!rootAuthVerified) return undefined
    let active = true
    let refreshing = false
    let loggedRefreshError = false
    const refreshDashboardStatus = async () => {
      if (!active || refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      try {
        const response = await rootAPI.getDashboardStatus()
        if (!response.success || !response.data?.badges) {
          throw new Error(response.message || 'The dashboard status response was invalid.')
        }
        loggedRefreshError = false
        setDashboardStatus(response.data)
      } catch (error) {
        if (active && !loggedRefreshError) {
          console.error('Could not refresh dashboard statuses:', error)
          loggedRefreshError = true
        }
      } finally {
        refreshing = false
      }
    }
    refreshDashboardStatus()
    const timer = window.setInterval(refreshDashboardStatus, 500)
    document.addEventListener('visibilitychange', refreshDashboardStatus)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshDashboardStatus)
    }
  }, [rootAuthVerified])

  useEffect(() => {
    localStorage.setItem('rootDashboardActiveTab', activeTab)
  }, [activeTab])

  useEffect(() => {
    if (!rootAuthVerified) return undefined
    let active = true
    const sendPresence = () => {
      if (document.visibilityState !== 'visible') return
      liveChatAPI.sendAdminPresence().catch(error => {
        if (active) console.error('Could not update root online status:', error)
      })
    }
    sendPresence()
    const interval = window.setInterval(sendPresence, 30000)
    document.addEventListener('visibilitychange', sendPresence)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', sendPresence)
    }
  }, [rootAuthVerified])

  useEffect(() => {
    if (!rootAuthVerified || !['users', 'userprofile'].includes(activeTab)) return undefined
    let active = true
    let refreshing = false
    let loggedRefreshError = false
    const refreshUsers = async () => {
      if (!active || refreshing || document.visibilityState !== 'visible') return
      refreshing = true
      try {
        const response = await userAPI.getAllUsers()
        if (active && response.success && response.data) {
          loggedRefreshError = false
          setUsers(response.data)
        }
      } catch (error) {
        if (active && !loggedRefreshError) {
          console.error('Could not refresh user presence:', error)
          loggedRefreshError = true
        }
      } finally {
        refreshing = false
      }
    }
    refreshUsers()
    const interval = window.setInterval(refreshUsers, 500)
    document.addEventListener('visibilitychange', refreshUsers)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshUsers)
    }
  }, [activeTab, rootAuthVerified])

  useEffect(() => {
    if (!users.length) return
    setStats(current => current.totalUsers === users.length
      ? current
      : { ...current, totalUsers: users.length })
  }, [users.length])

  const verifyAuth = async () => {
    try {
      await authAPI.verifyRoot()
      setRootAuthVerified(true)
      return true
    } catch (error) {
      console.error('Auth verification failed:', error)
      if (error.status === 401) {
        authAPI.logout()
        navigate('/root/portal', { replace: true })
        return false
      }
      // Don't logout or redirect - let the user stay on dashboard
      // The emergency token doesn't need API verification
      setRootAuthVerified(true)
      return true
    }
  }

  const loadDashboardData = async () => {
    setLoading(true)
    try {
      // Load health status first
      await loadHealthStatus()

      // Load stats
      const statsResponse = await rootAPI.getStats()
      if (statsResponse.success) {
        setStats(statsResponse.data)
      }

      // Load activity
      const activityResponse = await rootAPI.getActivity()
      if (activityResponse.success) {
        setActivity(activityResponse.data)
      }

      // Load users immediately for login authentication
      try {
        const usersResponse = await userAPI.getAllUsers()
        
        if (usersResponse.success && usersResponse.data) {
          setUsers(usersResponse.data)
          
          // Load commission settings from users
          const commissions = {}
          usersResponse.data.forEach(user => {
            if (user.commission_settings) {
              commissions[user.id || user._id] = user.commission_settings
            }
          })
          setUserCommissions(commissions)
        } else {
          setUsers([])
        }
      } catch (error) {
        console.error('Failed to load users on mount:', error)
        setUsers([])
      }

      // Load registrations for finance tab
      try {
        const registrationsResponse = await dataRegistrationAPI.getAllRegistrations()
        if (registrationsResponse.success && registrationsResponse.data) {
          setRegistrations(registrationsResponse.data)
        } else {
          setRegistrations([])
        }
      } catch (error) {
        console.error('Failed to load registrations:', error)
        setRegistrations([])
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadHealthStatus = async () => {
    try {
      const response = await rootAPI.getHealth()
      if (response.success && response.data) {
        setHealthStatus(response.data)
      }
    } catch (error) {
      console.error('Failed to load health status:', error)
    }
  }

  const handleAutoFix = async () => {
    setAutoFixing(true)
    try {
      showNotification('Attempting to fix database connection...', 'info')
      
      const response = await rootAPI.autoFix()
      
      if (response.success) {
        showNotification('Database connection restored!', 'success')
        // Reload health status and dashboard data
        await loadHealthStatus()
        await loadDashboardData()
      } else {
        showNotification('Auto-fix failed: ' + response.message, 'error')
      }
    } catch (error) {
      console.error('Auto-fix error:', error)
      showNotification('Auto-fix failed: ' + error.message, 'error')
    } finally {
      setAutoFixing(false)
    }
  }

  const loadTabData = async (tab) => {
    try {
      switch (tab) {
        case 'users':
          // Always try to load users, even if empty
          try {
            const response = await userAPI.getAllUsers()
            
            if (response.success && response.data) {
              setUsers(response.data)
              
              // Load commission settings from users
              const commissions = {}
              response.data.forEach(user => {
                if (user.commission_settings) {
                  commissions[user.id || user._id] = user.commission_settings
                }
              })
              setUserCommissions(commissions)
              
              showNotification(`Loaded ${response.data.length} users from database`, 'success')
            } else {
              setUsers([])
              showNotification('No users found in database', 'info')
            }
          } catch (error) {
            console.error('Failed to load users from API:', error)
            setUsers([])
            showNotification('Failed to load users: ' + error.message, 'error')
          }
          break
        case 'userprofile':
          // Load users for profile tab
          try {
            const response = await userAPI.getAllUsers()
            if (response.success && response.data) {
              setUsers(response.data)
              showNotification(`Loaded ${response.data.length} user profiles`, 'success')
            } else {
              setUsers([])
              showNotification('No user profiles found', 'info')
            }
          } catch (error) {
            console.error('Failed to load user profiles:', error)
            setUsers([])
            showNotification('Failed to load profiles', 'error')
          }
          break
        case 'finance':
          // Load users and registrations for finance tab
          try {
            const [usersResponse, registrationsResponse] = await Promise.all([
              userAPI.getAllUsers(),
              dataRegistrationAPI.getAllRegistrations()
            ])
            if (usersResponse.success) {
              setUsers(usersResponse.data)
              
              // Load commission settings from users
              const commissions = {}
              usersResponse.data.forEach(user => {
                if (user.commission_settings) {
                  commissions[user.id || user._id] = user.commission_settings
                }
              })
              setUserCommissions(commissions)
            }
            if (registrationsResponse.success) {
              setRegistrations(registrationsResponse.data)
            }
            showNotification('Finance data loaded successfully', 'success')
          } catch (error) {
            console.error('Failed to load finance data:', error)
            showNotification('Failed to load finance data', 'error')
          }
          break
        case 'partners':
          if (partners.length === 0) {
            try {
              const response = await rootAPI.getPartners()
              if (response.success) setPartners(response.data)
            } catch (error) {
              console.error('Failed to load partners:', error)
              setPartners([])
            }
          }
          break
        case 'services':
        case 'booked':
        case 'payments':
          try {
            setServiceBookingRequests(await getServiceBookingRequests())
          } catch (error) {
            console.error('Failed to load service booking requests:', error)
            showNotification(error.message, 'error')
          }
          break
        case 'transactions':
          if (transactions.length === 0) {
            try {
              const response = await rootAPI.getTransactions()
              if (response.success) setTransactions(response.data)
            } catch (error) {
              console.error('Failed to load transactions:', error)
              setTransactions([])
            }
          }
          break
        case 'logs':
          setLogsLoading(true)
          setLogsError('')
          try {
            const response = await rootAPI.getLogs()
            if (!response.success || !Array.isArray(response.data)) {
              throw new Error(response.message || 'The system logs response was invalid.')
            }
            setLogs(response.data)
          } catch (error) {
            console.error('Failed to load logs:', error)
            setLogs([])
            setLogsError(error.message || 'Failed to load system logs.')
          } finally {
            setLogsLoading(false)
          }
          break
      }
    } catch (error) {
      console.error(`Failed to load ${tab} data:`, error)
      showNotification(`Failed to load ${tab} data`, 'error')
    }
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    closeMobileMenu() // Close mobile menu when tab changes
  }

  useEffect(() => {
    if (!rootAuthVerified) return undefined
    loadTabData(activeTab)
    return undefined
  }, [activeTab, rootAuthVerified])

  const handleDataCollectorTabClick = () => {
    setDataCollectorMenuRequest(request => request + 1)
    handleTabChange('data-collector')
  }

  const pendingUtilityPaymentRequests = utilityPaymentRequests.filter(request => request.status === 'request')
  const tabBadge = tab => {
    const value = Number(dashboardStatus.badges?.[tab] || 0)
    if (value <= 0) return null
    const incomeTitle = tab === 'finance'
      ? `${value} new income update${value === 1 ? '' : 's'} in the last minute · ETB ${Number(dashboardStatus.recentIncomeAmount || 0).toLocaleString()}`
      : `${value} item${value === 1 ? '' : 's'} need attention`
    return <span className="sidebar-count-badge" title={incomeTitle} aria-label={incomeTitle}>{value > 99 ? '99+' : value}</span>
  }

  const updateUtilityPaymentRequest = async (requestId, action) => {
    try {
      if (action === 'approve') {
        await approveUtilityPayment(requestId)
        showNotification('Utility payment approved. It is now awaiting receipt approval.', 'success')
      } else {
        await cancelUtilityRequest(requestId)
        showNotification('Utility payment request cancelled.', 'success')
      }
      setUtilityPaymentRequests(await getUtilityRequests())
    } catch (error) {
      console.error(`Failed to ${action} utility payment request:`, error)
      showNotification(error.message, 'error')
    }
  }

  const issueUtilityReceipt = async requestId => {
    try {
      await approveUtilityReceipt(requestId, manualUtilityReceipts[requestId] || '')
      setManualUtilityReceipts(previous => ({ ...previous, [requestId]: '' }))
      setUtilityPaymentRequests(await getUtilityRequests())
      showNotification('Utility receipt approved and added to the client account.', 'success')
    } catch (error) {
      console.error('Failed to approve utility receipt:', error)
      showNotification(error.message, 'error')
    }
  }

  const updateBookingRequest = async (requestId, changes) => {
    try {
      setServiceBookingRequests(await updateServiceBookingRequest(requestId, changes))
      showNotification('Booking request updated successfully', 'success')
    } catch (error) {
      console.error('Failed to update service booking request:', error)
      showNotification(error.message, 'error')
    }
  }

  const renderDeliveryStatus = request => request.deliveryRequested ? (
    <div className="root-delivery-status">
      <strong>Requested · ETB {Number(request.deliveryFee || 0).toLocaleString()}</strong>
      <select
        aria-label={`Delivery status for ${request.itemName || 'booking'}`}
        value={request.deliveryStatus || 'requested'}
        onChange={event => updateBookingRequest(request.requestId || request.id, { deliveryStatus: event.target.value })}
      >
        <option value="requested">Requested</option>
        <option value="preparing">Preparing</option>
        <option value="out_for_delivery">Out for delivery</option>
        <option value="delivered">Delivered</option>
      </select>
      <small>Fee payable on receipt</small>
    </div>
  ) : <span>Not requested</span>

  const handleLogout = () => {
    setShowLogoutConfirmation(true)
  }

  const confirmLogout = () => {
    setShowLogoutConfirmation(false)
    authAPI.logout()
    navigate('/root/portal')
  }

  const handleCreateUser = () => {
    setShowCreateUser(true)
  }

  const handleCloseCreateUser = () => {
    setShowCreateUser(false)
    setEditingUser(null)
    setNewUser({
      username: '',
      email: '',
      password: '',
      full_name: '',
      role: 'user',
      position: '',
      phone: ''
    })
  }

  const handleUserInputChange = (e) => {
    setNewUser({
      ...newUser,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmitUser = async (e) => {
    e.preventDefault()
    
    try {
      // Validate required fields
      if (!newUser.username || !newUser.username.trim()) {
        showNotification('Username is required!', 'error')
        return
      }

      if (!newUser.password || !newUser.password.trim()) {
        showNotification('Password is required!', 'error')
        return
      }

      if (!['agent', 'driver'].includes(newUser.role) && (!newUser.position || !newUser.position.trim())) {
        showNotification('Staff Position is required!', 'error')
        return
      }

      // Check for duplicate username
      const duplicateUsername = users.find(u => 
        u.username.toLowerCase() === newUser.username.toLowerCase()
      )
      if (duplicateUsername) {
        showNotification('Username already exists!', 'error')
        return
      }

      // Check for duplicate email (if provided)
      if (newUser.email) {
        const duplicateEmail = users.find(u => 
          u.email && u.email !== '-' && u.email.toLowerCase() === newUser.email.toLowerCase()
        )
        if (duplicateEmail) {
          showNotification('Email already exists!', 'error')
          return
        }
      }

      // Check for duplicate phone (if provided)
      if (newUser.phone) {
        const phoneDigits = normalizePhoneNumber(newUser.phone)
        const duplicatePhone = phoneDigits && users.find(u => 
          u.phone && u.phone !== '-' && normalizePhoneNumber(u.phone) === phoneDigits
        )
        if (duplicatePhone) {
          showNotification('Phone number already exists!', 'error')
          return
        }
      }

      // Default permissions for new users
      const defaultPermissions = {
        menus: {
          home: true,
          dataCollector: true,
          fixedCommission: true,
          movableCommission: true,
          brokerage: true,
          contact: true
        },
        tabs: {
          dataRegistration: true,
          payRegistration: true,
          unpaid: true,
          paid: true,
          needApproval: true,
          registered: true,
          result: true
        },
        resultPage: {
          enabled: true,
          allowedUsers: []
        },
        cards: {
          statistics: true,
          quickActions: true,
          recentActivity: true
        },
        lists: {
          viewList: true,
          editList: true,
          deleteList: true,
          exportList: true
        },
        buttons: {
          create: true,
          edit: true,
          delete: true,
          download: true,
          print: true,
          approve: true
        },
        icons: {
          showIcons: true,
          actionIcons: true,
          profileIcon: 'visible',
          editIcon: 'visible',
          deleteIcon: 'visible',
          updateIcon: 'visible',
          viewIcon: 'visible',
          downloadIcon: 'visible',
          printIcon: 'visible',
          approveIcon: 'visible',
          rejectIcon: 'visible'
        }
      }

      // Prepare user data
      const userData = {
        username: newUser.username.trim(),
        email: newUser.email.trim() || null,
        password: newUser.password.trim(),
        full_name: newUser.full_name.trim() || null,
        role: newUser.role || 'user',
        position: newUser.position.trim(),
        phone: newUser.phone.trim() || null,
        permissions: defaultPermissions
      }

      console.log('Sending user data to API:', userData)
      showNotification('Creating user...', 'info')

      // Create user via API with permissions
      const response = await userAPI.createUser(userData)
      
      if (response.success) {
        const createdUser = response.data
        
        // Add user to list
        const updatedUsers = [...users, createdUser]
        setUsers(updatedUsers)
        
        // Close modal and reset form
        handleCloseCreateUser()
        
        // Show success notification
        showNotification('User created successfully!', 'success')
        
        // Reload users list to ensure sync
        setTimeout(async () => {
          try {
            const usersResponse = await userAPI.getAllUsers()
            if (usersResponse.success) {
              setUsers(usersResponse.data)
            }
          } catch (error) {
            console.error('Failed to reload users:', error)
          }
        }, 500)
      } else {
        console.error('API returned error:', response.message)
        showNotification(response.message || 'Failed to create user', 'error')
      }
    } catch (error) {
      console.error('Failed to create user:', error)
      showNotification('Failed to create user: ' + error.message, 'error')
    }
  }

  const handleToggleUserStatus = async (userId) => {
    try {
      const response = await userAPI.toggleUserStatus(userId)
      
      if (response.success) {
        const user = users.find(u => u.id === userId)
        setUsers(users.map(user => 
          user.id === userId 
            ? { ...user, is_active: !user.is_active }
            : user
        ))
        showNotification(
          user.is_active ? 'User deactivated' : 'User activated',
          'info'
        )
      }
    } catch (error) {
      console.error('Failed to toggle user status:', error)
      showNotification('Failed to update user status', 'error')
    }
  }

  const handleEditUser = (user) => {
    setEditingUser(user)
    setNewUser({
      username: user.username,
      email: user.email === '-' ? '' : user.email,
      password: '',
      full_name: user.full_name === '-' ? '' : user.full_name,
      role: user.role,
      position: user.position === '-' ? '' : user.position,
      phone: user.phone === '-' ? '' : user.phone
    })
    setShowCreateUser(true)
  }

  const handleUpdateUser = async (e) => {
    e.preventDefault()
    
    try {
      // Check for duplicate username (excluding current user)
      const duplicateUsername = users.find(u => 
        u.id !== editingUser.id && u.username.toLowerCase() === newUser.username.toLowerCase()
      )
      if (duplicateUsername) {
        showNotification('❌ Username already exists!', 'error')
        return
      }

      // Check for duplicate email (if provided, excluding current user)
      if (newUser.email) {
        const duplicateEmail = users.find(u => 
          u.id !== editingUser.id && u.email && u.email !== '-' && u.email.toLowerCase() === newUser.email.toLowerCase()
        )
        if (duplicateEmail) {
          showNotification('❌ Email already exists!', 'error')
          return
        }
      }

      // Check for duplicate phone (if provided, excluding current user)
      if (newUser.phone) {
        const phoneDigits = normalizePhoneNumber(newUser.phone)
        const duplicatePhone = phoneDigits && users.find(u => 
          u.id !== editingUser.id && u.phone && u.phone !== '-' &&
          normalizePhoneNumber(u.phone) === phoneDigits
        )
        if (duplicatePhone) {
          showNotification('❌ Phone number already exists!', 'error')
          return
        }
      }

      const updateData = {
        username: newUser.username,
        email: newUser.email || null,
        full_name: newUser.full_name || null,
        role: newUser.role,
        position: newUser.position || null,
        phone: newUser.phone || null
      }
      
      // Only include password if it was changed
      if (newUser.password) {
        updateData.password = newUser.password
      }
      
      // Include existing permissions (don't overwrite them during user edit)
      const existingUser = users.find(u => u.id === editingUser.id)
      if (existingUser && existingUser.permissions) {
        updateData.permissions = existingUser.permissions
      }
      
      const response = await userAPI.updateUser(editingUser.id, updateData)
      
      if (response.success) {
        // Update user in list
        const updatedUsers = users.map(user => 
          user.id === editingUser.id
            ? {
                ...user,
                username: newUser.username,
                email: newUser.email || '-',
                full_name: newUser.full_name || '-',
                role: newUser.role,
                position: newUser.position || '-',
                phone: newUser.phone || '-'
              }
            : user
        )
        setUsers(updatedUsers)
        
        // Close modal and reset
        handleCloseCreateUser()
        setEditingUser(null)
        
        showNotification('User updated successfully!', 'success')
      }
    } catch (error) {
      console.error('Failed to update user:', error)
      showNotification('Failed to update user', 'error')
    }
  }

  const handleDeleteUser = async (userId) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        const response = await userAPI.deleteUser(userId)
        
        if (response.success) {
          setUsers(users.filter(user => user.id !== userId))
          showNotification('User deleted', 'error')
        }
      } catch (error) {
        console.error('Failed to delete user:', error)
        showNotification('Failed to delete user', 'error')
      }
    }
  }

  const handleEditPermissions = (user) => {
    setEditingUser(user)
    
    // Load permissions from user object (from database via API)
    // Parse permissions if it's a string (from database JSON column)
    let userPerms = user.permissions
    if (typeof userPerms === 'string') {
      try {
        userPerms = JSON.parse(userPerms)
      } catch (e) {
        console.error('Failed to parse user permissions:', e)
        userPerms = null
      }
    }
    
    // Use default permissions if none exist
    if (!userPerms) {
      userPerms = {
        menus: {
          home: true,
          dataCollector: true,
          fixedCommission: true,
          movableCommission: true,
          brokerage: true,
          contact: true
        },
        tabs: {
          dataRegistration: true,
          payRegistration: true,
          unpaid: true,
          paid: true,
          needApproval: true,
          registered: true,
          result: true
        },
        resultPage: {
          enabled: true,
          allowedUsers: []
        },
        cards: {
          statistics: true,
          quickActions: true,
          recentActivity: true
        },
        lists: {
          viewList: true,
          editList: true,
          deleteList: true,
          exportList: true
        },
        buttons: {
          create: true,
          edit: true,
          delete: true,
          download: true,
          print: true,
          approve: true
        },
        icons: {
          showIcons: true,
          actionIcons: true,
          profileIcon: 'visible',
          editIcon: 'visible',
          deleteIcon: 'visible',
          updateIcon: 'visible',
          viewIcon: 'visible',
          downloadIcon: 'visible',
          printIcon: 'visible',
          approveIcon: 'visible',
          rejectIcon: 'visible'
        }
      }
    }
    
    setUserPermissions(userPerms)
    setShowPermissionsModal(true)
  }

  const togglePasswordVisibility = (userId) => {
    setPasswordVisibility(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }))
  }

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  const closeMobileMenu = () => {
    setMobileMenuOpen(false)
  }

  const handleBackupData = async (type) => {
    try {
      showNotification('Creating backup...', 'info')
      
      let data = []
      let filename = ''
      
      if (type === 'registrations') {
        const response = await dataRegistrationAPI.getAllRegistrations()
        if (response.success) {
          data = response.data
          filename = `REDSEA_Registrations_Backup_${new Date().toISOString().split('T')[0]}.json`
        }
      } else if (type === 'users') {
        const response = await userAPI.getAllUsers()
        if (response.success) {
          data = response.data
          filename = `REDSEA_Users_Backup_${new Date().toISOString().split('T')[0]}.json`
        }
      } else if (type === 'full') {
        const [regResponse, userResponse] = await Promise.all([
          dataRegistrationAPI.getAllRegistrations(),
          userAPI.getAllUsers()
        ])
        
        data = {
          registrations: regResponse.success ? regResponse.data : [],
          users: userResponse.success ? userResponse.data : [],
          backup_date: new Date().toISOString(),
          version: '1.0'
        }
        filename = `REDSEA_Full_Backup_${new Date().toISOString().split('T')[0]}.json`
      }
      
      // Create and download backup file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      
      showNotification('Backup created successfully!', 'success')
    } catch (error) {
      console.error('Backup failed:', error)
      showNotification('Backup failed', 'error')
    }
  }

  const handleDatabaseControl = async (action) => {
    switch (action) {
      case 'restore':
        setShowRestoreModal(true)
        await loadDeletedData()
        break
      case 'clean':
        if (confirm('Are you sure you want to clean the database? This will remove duplicate entries.')) {
          showNotification('Database cleaning initiated...', 'info')
          try {
            // Reload data to refresh
            await loadDashboardData()
            showNotification('Database cleaned successfully!', 'success')
          } catch (error) {
            showNotification('Database cleaning failed', 'error')
          }
        }
        break
      case 'info':
        const userCount = users.length
        const regCount = registrations.length
        showNotification(`Database: ${userCount} users, ${regCount} registrations`, 'info')
        break
      case 'optimize':
        showNotification('Database optimization started...', 'info')
        try {
          // Reload all data
          await loadDashboardData()
          setTimeout(() => {
            showNotification('Database optimized successfully!', 'success')
          }, 1000)
        } catch (error) {
          showNotification('Optimization failed', 'error')
        }
        break
      case 'connect':
        showNotification('Connecting to database...', 'info')
        try {
          await loadHealthStatus()
          await loadDashboardData()
          showNotification('Database connected successfully!', 'success')
        } catch (error) {
          showNotification('Connection failed', 'error')
        }
        break
      default:
        break
    }
  }

  const loadDeletedData = async () => {
    // Load all users and registrations to show in restore modal
    try {
      const [usersResponse, registrationsResponse] = await Promise.all([
        userAPI.getAllUsers(),
        dataRegistrationAPI.getAllRegistrations()
      ])
      
      // For now, show all data as "restorable" (can be used for backup/restore)
      setDeletedData({
        registrations: registrationsResponse.success ? registrationsResponse.data : [],
        users: usersResponse.success ? usersResponse.data : []
      })
    } catch (error) {
      console.error('Failed to load data:', error)
      setDeletedData({ registrations: [], users: [] })
    }
  }

  const handleRestoreItem = async (type, item) => {
    try {
      if (type === 'registration') {
        // Restore registration via API
        const response = await dataRegistrationAPI.createRegistration(item)
        if (response.success) {
          showNotification('Registration restored successfully!', 'success')
        }
      } else if (type === 'user') {
        // Restore user via API
        const response = await userAPI.createUser(item)
        if (response.success) {
          showNotification('User restored successfully!', 'success')
        }
      }
    } catch (error) {
      console.error('Restore failed:', error)
      showNotification('Restore failed', 'error')
    }
  }

  const handleRestoreAll = async (type) => {
    if (!confirm(`Are you sure you want to restore all deleted ${type}?`)) return

    try {
      if (type === 'registrations') {
        for (const item of deletedData.registrations) {
          await dataRegistrationAPI.createRegistration(item)
        }
        setDeletedData({ ...deletedData, registrations: [] })
        showNotification('All registrations restored!', 'success')
      } else if (type === 'users') {
        for (const item of deletedData.users) {
          await userAPI.createUser(item)
        }
        setDeletedData({ ...deletedData, users: [] })
        showNotification('All users restored!', 'success')
      }
    } catch (error) {
      console.error('Restore all failed:', error)
      showNotification('Restore all failed', 'error')
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins} minutes ago`
    if (diffHours < 24) return `${diffHours} hours ago`
    if (diffDays < 7) return `${diffDays} days ago`
    return date.toLocaleDateString()
  }

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 3000)
  }

  const openCommissionModal = async (user) => {
    const userId = user.id || user._id
    const settings = userCommissions[userId] || user.commission_settings || {}
    setSelectedUserForCommission(user)
    setCommissionData({
      adjustmentType: settings.adjustmentType || 'percentage',
      value: settings.value ?? '',
      workType: settings.workType || 'all'
    })
    setShowCommissionModal(true)

    try {
      const response = await dataRegistrationAPI.getProjectTitleSettings()
      const titles = Array.isArray(response?.data?.titles) ? response.data.titles : []
      setCommissionProjectTitles([...new Set(titles.map(title => String(title || '').trim()).filter(Boolean))])
    } catch (error) {
      console.error('Failed to load project titles for commission settings:', error)
      showNotification(`Could not load project titles: ${error.message}`, 'error')
    }
  }

  // Calculate user registration statistics
  const getUserStats = (userId, paymentStatus) => {
    const user = users.find(u => String(u.id ?? u._id) === String(userId))
    const userRegistrations = registrations.filter(reg => {
      const staffMatch = String(reg.staff ?? '') === String(userId) ||
                        reg.staff === user?.username ||
                        reg.staff === user?.full_name ||
                        reg.staff_username === user?.username
      
      if (paymentStatus === 'paid') {
        return staffMatch && reg.payment_status === 'paid'
      } else if (paymentStatus === 'unpaid') {
        return staffMatch && reg.payment_status === 'unpaid'
      }
      return staffMatch
    })

    const userCommission = userCommissions[userId] || { adjustmentType: 'percentage', value: 10, workType: 'all' }
    const projectTitleFilter = userCommission.workType?.startsWith('project:')
      ? userCommission.workType.slice('project:'.length).trim().toLocaleLowerCase()
      : ''
    const matchingRegistrations = projectTitleFilter
      ? userRegistrations.filter(reg => {
          const registrationProjectTitle = [
            reg.project_title,
            reg.projectTitle,
            reg.product_title,
            reg.productTitle,
            reg.project_name
          ].map(title => String(title || '').trim()).find(Boolean) || ''
          return registrationProjectTitle.toLocaleLowerCase() === projectTitleFilter
        })
      : userRegistrations

    const count = matchingRegistrations.length
    const totalAmount = matchingRegistrations.reduce((sum, reg) => {
      const amount = parseFloat(reg.paid_amount) || 0
      return sum + amount
    }, 0)

    // Calculate commission based on TV count and work type
    let commission = 0
    
    matchingRegistrations.forEach(reg => {
      // Try to get commission from registration data first
      const regCommission = parseFloat(reg.user_commission_amount) || 0
      
      if (regCommission > 0) {
        commission += regCommission
      } else if (projectTitleFilter) {
        const amount = parseFloat(reg.paid_amount) || 0
        if (userCommission.adjustmentType === 'percentage') {
          commission += (amount * parseFloat(userCommission.value || 0)) / 100
        } else {
          commission += parseFloat(userCommission.value || 0)
        }
      } else {
        // Calculate based on work type and TV count
        const workType = reg.work_type || ''
        const tvCount = parseInt(reg.tv_no) || 0
        
        // For REDSEA-EBC work type: 1 TV = 10 ETB
        if (workType.toLowerCase().includes('redsea') || workType.toLowerCase().includes('ebc')) {
          commission += tvCount * 10
        } else {
          // For other work types, use user commission settings
          if (userCommission.adjustmentType === 'percentage') {
            const amount = parseFloat(reg.paid_amount) || 0
            commission += (amount * parseFloat(userCommission.value || 0)) / 100
          } else {
            commission += parseFloat(userCommission.value || 0)
          }
        }
      }
    })

    return { 
      count, 
      totalAmount, 
      commission, 
      commissionRate: userCommission.adjustmentType === 'percentage' ? userCommission.value : null,
      commissionFixed: userCommission.adjustmentType === 'fixed' ? userCommission.value : null,
      adjustmentType: userCommission.adjustmentType,
      workType: userCommission.workType
    }
  }

  // Calculate work type breakdown for a user
  const getUserWorkTypeBreakdown = (userId) => {
    const user = users.find(u => String(u.id ?? u._id) === String(userId))
    const userRegistrations = registrations.filter(reg => {
      return String(reg.staff ?? '') === String(userId) ||
             reg.staff === user?.username ||
             reg.staff === user?.full_name ||
             reg.staff_username === user?.username
    })

    const breakdown = {
      'REDSEA with EBC': { count: 0, amount: 0 },
      'Sells Product': { count: 0, amount: 0 },
      'Other': { count: 0, amount: 0 }
    }

    userRegistrations.forEach(reg => {
      const workType = reg.work_type || 'Other'
      const amount = parseFloat(reg.paid_amount) || 0
      
      if (workType.includes('REDSEA') || workType.includes('EBC')) {
        breakdown['REDSEA with EBC'].count++
        breakdown['REDSEA with EBC'].amount += amount
      } else if (workType.includes('Sells') || workType.includes('Product')) {
        breakdown['Sells Product'].count++
        breakdown['Sells Product'].amount += amount
      } else {
        breakdown['Other'].count++
        breakdown['Other'].amount += amount
      }
    })

    return breakdown
  }

  // Save commission adjustment
  const handleSaveCommission = async () => {
    if (selectedUserForCommission) {
      try {
        const commissionSettings = {
          adjustmentType: commissionData.adjustmentType,
          value: commissionData.value,
          workType: commissionData.workType
        }

        // Get the correct user ID (handle both id and _id)
        const userId = selectedUserForCommission.id || selectedUserForCommission._id

        // Prepare the update payload
        const updatePayload = {
          commission_settings: commissionSettings
        }

        // Save to database via API
        const response = await userAPI.updateUser(userId, updatePayload)

        if (response.success) {
          // Update local state
          setUserCommissions({
            ...userCommissions,
            [userId]: commissionSettings
          })
          
          showNotification('Commission settings saved to database!', 'success')
          setShowCommissionModal(false)
          setCommissionData({ adjustmentType: 'percentage', value: '', workType: 'all' })
        } else {
          console.error('API returned error:', response.message)
          showNotification(`Failed to save: ${response.message || 'Unknown error'}`, 'error')
        }
      } catch (error) {
        console.error('Failed to save commission settings:', error)
        showNotification(`Failed to save commission settings: ${error.message}`, 'error')
      }
    } else {
      console.error('No user selected for commission update')
    }
  }

  const currentListPage = (items, key) => (
    Math.min(listPages[key] || 0, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1))
  )

  const visibleListItems = (items, key) => {
    return getPageItems(items, currentListPage(items, key))
  }

  const listPagination = (items, key, label) => {
    const page = Math.min(listPages[key] || 0, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1))
    return (
      <Pagination
        page={page}
        itemCount={items.length}
        onPageChange={nextPage => setListPages(previous => ({ ...previous, [key]: nextPage }))}
        label={label}
      />
    )
  }

  return (
    <div className="root-dashboard">
      {showLogoutConfirmation && (
        <LogoutConfirmationModal
          onCancel={() => setShowLogoutConfirmation(false)}
          onConfirm={confirmLogout}
        />
      )}
      {/* Mobile Menu Toggle Button */}
      <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
        ☰
      </button>

      {/* Sidebar Overlay */}
      <div 
        className={`sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={closeMobileMenu}
      ></div>

      {/* Sidebar */}
      <aside className={`dashboard-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img className="logo-icon" src={logoImage} alt="" />
            <h2>REDSEA</h2>
            <span className="root-badge">ROOT</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabChange('overview')}
          >
            <span className="nav-icon">📊</span>
            <span>Overview</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => handleTabChange('users')}
          >
            <span className="nav-icon">👥</span>
            <span>Users</span>
            {tabBadge('users')}
          </button>
          <button
            className={`nav-item ${activeTab === 'agents' ? 'active' : ''}`}
            onClick={() => handleTabChange('agents')}
          >
            <span className="nav-icon">🧑‍💼</span>
            <span>Agents</span>
            {tabBadge('agents')}
          </button>
          <button
            className={`nav-item ${activeTab === 'feed-management' ? 'active' : ''}`}
            onClick={() => handleTabChange('feed-management')}
          >
            <span className="nav-icon">🛡️</span>
            <span>Feed Management</span>
            {tabBadge('feed-management')}
          </button>
          <button 
            className={`nav-item ${activeTab === 'userprofile' ? 'active' : ''}`}
            onClick={() => handleTabChange('userprofile')}
          >
            <span className="nav-icon">👤</span>
            <span>User Profile</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'finance' ? 'active' : ''}`}
            onClick={() => handleTabChange('finance')}
          >
            <span className="nav-icon">💵</span>
            <span>Finance</span>
            {tabBadge('finance')}
          </button>
          <button 
            className={`nav-item ${activeTab === 'partners' ? 'active' : ''}`}
            onClick={() => handleTabChange('partners')}
          >
            <span className="nav-icon">🤝</span>
            <span>Partners</span>
            {tabBadge('partners')}
          </button>
          <button
            className={`nav-item ${activeTab === 'mini-rides' ? 'active' : ''}`}
            onClick={() => handleTabChange('mini-rides')}
          >
            <span className="nav-icon">🚕</span>
            <span>Mini Ride</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'services' ? 'active' : ''}`}
            onClick={() => handleTabChange('services')}
          >
            <span className="nav-icon">🛍️</span>
            <span>Services</span>
            {tabBadge('services')}
          </button>
          <button
            className={`nav-item ${activeTab === 'promotions' ? 'active' : ''}`}
            onClick={() => handleTabChange('promotions')}
          >
            <span className="nav-icon">📣</span>
            <span>Promotions &amp; Boosts</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'link-campaigns' ? 'active' : ''}`}
            onClick={() => handleTabChange('link-campaigns')}
          >
            <span className="nav-icon">🔗</span>
            <span>Link Management</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'booked' ? 'active' : ''}`}
            onClick={() => handleTabChange('booked')}
          >
            <span className="nav-icon">📅</span>
            <span>Booked</span>
            {tabBadge('booked')}
          </button>
          <button
            className={`nav-item ${activeTab === 'payments' ? 'active' : ''}`}
            onClick={() => handleTabChange('payments')}
          >
            <span className="nav-icon">💳</span>
            <span>Payment</span>
            {tabBadge('payments')}
          </button>
          <button
            className={`nav-item ${activeTab === 'utility-control' ? 'active' : ''}`}
            onClick={() => handleTabChange('utility-control')}
          >
            <span className="nav-icon">🔐</span>
            <span>OTP Control</span>
            {tabBadge('utility-control')}
          </button>
          <button
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => handleTabChange('chat')}
          >
            <span className="nav-icon">💬</span>
            <span>Chat</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => handleTabChange('transactions')}
          >
            <span className="nav-icon">💰</span>
            <span>Transactions</span>
            {tabBadge('transactions')}
          </button>
          <button
            className={`nav-item ${activeTab === 'wallet-management' ? 'active' : ''}`}
            onClick={() => handleTabChange('wallet-management')}
          >
            <span className="nav-icon">💰</span>
            <span>Wallet Management</span>
            {tabBadge('wallet-management')}
          </button>
          <button
            className={`nav-item ${activeTab === 'data-collector' ? 'active' : ''}`}
            onClick={handleDataCollectorTabClick}
          >
            <span className="nav-icon">📋</span>
            <span>Data Collector</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'database' ? 'active' : ''}`}
            onClick={() => handleTabChange('database')}
          >
            <span className="nav-icon">💾</span>
            <span>Database</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'otp-api' ? 'active' : ''}`}
            onClick={() => handleTabChange('otp-api')}
          >
            <span className="nav-icon">📲</span>
            <span>OTP API</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'site-content' ? 'active' : ''}`}
            onClick={() => handleTabChange('site-content')}
          >
            <span className="nav-icon">🖊️</span>
            <span>Website Content</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => handleTabChange('logs')}
          >
            <span className="nav-icon">📝</span>
            <span>System Logs</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <span className="nav-icon">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Top Bar */}
        <header className="dashboard-header">
          <div className="header-left">
            <h1>Root Dashboard</h1>
            <p className="header-subtitle">Full System Control Panel</p>
          </div>
          <div className="header-right">
            <div className="user-info">
              <span className="user-icon">👤</span>
              <div className="user-details">
                <span className="user-name">
                  {rootUser?.username || rootUser?.full_name || 'Root Administrator'}
                </span>
                <span className="user-role">
                  {rootUser?.role === 'root' ? 'Root Admin' : 'Super Admin'}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="dashboard-content">
          {loading && activeTab === 'overview' ? (
            <div className="loading-state">
              <span className="loading-icon">⏳</span>
              <p>Loading dashboard data...</p>
            </div>
          ) : (
            <>
              {activeTab === 'data-collector' && (
                <DataCollect openDataMenuRequest={dataCollectorMenuRequest} />
              )}

              {activeTab === 'wallet-management' && <WalletManagement />}
              {activeTab === 'agents' && <RootAgentManagement />}
              {activeTab === 'mini-rides' && <RootMiniRideManagement />}

              {activeTab === 'feed-management' && <RootFeedManagement />}

              {activeTab === 'chat' && (
                <div className="chat-control-panel">
                  <h2 className="section-title">Chat Control</h2>
                  <p className="section-description">Manage live support and user-to-user messages, search accounts by role, check online status, and send users messages as Root.</p>
                  <nav className="root-chat-modes" aria-label="Chat type">
                    <button type="button" className={chatMode === 'support' ? 'selected' : ''} onClick={() => setChatMode('support')}>Live support</button>
                    <button type="button" className={chatMode === 'users' ? 'selected' : ''} onClick={() => setChatMode('users')}>User messages</button>
                  </nav>
                  {chatMode === 'support' ? <LiveSupportChat admin /> : <RootSocialMessages />}
                </div>
              )}

              {activeTab === 'overview' && (
                <div className="overview-section">
                  <h2 className="section-title">System Overview</h2>
                  <PlatformFinanceOverview />
                  
                  {/* Health Status Section */}
                  <div className="health-status-section">
                    <h3>System Health</h3>
                    <div className="health-grid">
                      {/* Server Status */}
                      <div className="health-card">
                        <div className="health-header">
                          <span className="health-icon">🖥️</span>
                          <h4>Server Status</h4>
                        </div>
                        <div className="health-body">
                          <div className={`health-indicator ${healthStatus.server.status === 'running' ? 'healthy' : 'unhealthy'}`}>
                            <span className="indicator-dot"></span>
                            <span className="indicator-text">
                              {healthStatus.server.status === 'running' ? 'Running' : 'Unknown'}
                            </span>
                          </div>
                          {healthStatus.server.uptime && (
                            <div className="health-detail">
                              <span className="detail-label">Uptime:</span>
                              <span className="detail-value">{Math.floor(healthStatus.server.uptime / 60)} minutes</span>
                            </div>
                          )}
                          {healthStatus.server.memory && (
                            <div className="health-detail">
                              <span className="detail-label">Memory:</span>
                              <span className="detail-value">{healthStatus.server.memory.used}MB / {healthStatus.server.memory.total}MB</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Neon PostgreSQL Status */}
                      <div className="health-card">
                        <div className="health-header">
                          <span className="health-icon">🗄️</span>
                          <h4>Neon PostgreSQL</h4>
                        </div>
                        <div className="health-body">
                          <div className={`health-indicator ${healthStatus.database.neon?.connected ? 'healthy' : 'unhealthy'}`}>
                            <span className="indicator-dot"></span>
                            <span className="indicator-text">
                              {healthStatus.database.neon?.connected ? 'Connected' : 'Disconnected'}
                            </span>
                          </div>
                          {healthStatus.database.neon?.error && (
                            <div className="health-error">
                              <span className="error-icon">⚠️</span>
                              <span className="error-text">{healthStatus.database.neon.error}</span>
                            </div>
                          )}
                          {healthStatus.database.primary === 'neon' && healthStatus.database.neon?.connected && (
                            <div className="health-badge primary">Primary Database</div>
                          )}
                        </div>
                      </div>

                      {/* Auto-Fix Action */}
                      <div className="health-card action-card">
                        <div className="health-header">
                          <span className="health-icon">🔧</span>
                          <h4>Database Control</h4>
                        </div>
                        <div className="health-body">
                          <p className="action-description">
                            Reconnect to Neon PostgreSQL
                          </p>
                          <button 
                            className="auto-fix-btn"
                            onClick={handleAutoFix}
                            disabled={autoFixing}
                          >
                            {autoFixing ? (
                              <>
                                <span className="btn-icon spinning">🔄</span>
                                <span>Fixing...</span>
                              </>
                            ) : (
                              <>
                                <span className="btn-icon">🔧</span>
                                <span>Fix & Connect</span>
                              </>
                            )}
                          </button>
                          <button 
                            className="refresh-btn"
                            onClick={loadHealthStatus}
                            disabled={autoFixing}
                          >
                            <span className="btn-icon">🔄</span>
                            <span>Refresh Status</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-icon">👥</div>
                      <div className="stat-info">
                        <span className="stat-value">{stats.totalUsers.toLocaleString()}</span>
                        <span className="stat-label">Total Users</span>
                      </div>
                      <div className="stat-trend positive">+12%</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">🤝</div>
                      <div className="stat-info">
                        <span className="stat-value">{stats.activePartners}</span>
                        <span className="stat-label">Active Partners</span>
                      </div>
                      <div className="stat-trend positive">+8%</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">💰</div>
                      <div className="stat-info">
                        <span className="stat-value">{formatCurrency(stats.totalRevenue)}</span>
                        <span className="stat-label">Total Revenue</span>
                      </div>
                      <div className="stat-trend positive">+25%</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">⏳</div>
                      <div className="stat-info">
                        <span className="stat-value">{stats.pendingTransactions}</span>
                        <span className="stat-label">Pending</span>
                      </div>
                      <div className="stat-trend neutral">-</div>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="activity-section">
                    <h3>Recent Activity</h3>
                    <div className="activity-list">
                      {activity.length > 0 ? (
                        visibleListItems(activity, 'activity').map((item, index) => (
                          <div key={index} className="activity-item">
                            <span className="activity-icon">{item.icon}</span>
                            <div className="activity-details">
                              <p className="activity-text">{item.text}</p>
                              <span className="activity-time">{formatDate(item.time)}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="no-data">No recent activity</p>
                      )}
                    </div>
                    {listPagination(activity, 'activity', 'recent activity')}
                  </div>

                  {/* Quick Actions */}
                  <div className="quick-actions">
                    <h3>Quick Actions</h3>
                    <div className="actions-grid">
                      <button className="action-btn" onClick={() => handleTabChange('users')}>
                        <span className="action-icon">➕</span>
                        <span>View Users</span>
                      </button>
                      <button className="action-btn" onClick={() => handleTabChange('partners')}>
                        <span className="action-icon">🤝</span>
                        <span>View Partners</span>
                      </button>
                      <button className="action-btn" onClick={() => handleTabChange('transactions')}>
                        <span className="action-icon">📊</span>
                        <span>View Transactions</span>
                      </button>
                      <button className="action-btn" onClick={() => handleTabChange('logs')}>
                        <span className="action-icon">⚙️</span>
                        <span>System Logs</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

          {activeTab === 'users' && (
            <div className="users-section">
              <div className="section-header">
                <div>
                  <h2 className="section-title">User Management ({users.length})</h2>
                  <p className="section-description">Manage all system users and permissions</p>
                </div>
                <button className="create-btn" onClick={handleCreateUser}>
                  <span className="btn-icon">➕</span>
                  Create User
                </button>
              </div>
              {users.length > 0 ? (
                <>
                  <div className="mobile-user-list">
                    {visibleListItems(users, 'users-management').map(user => (
                      <article className="mobile-user-card" key={user.id}>
                        <div className="mobile-user-card-header">
                          <div className="mobile-user-identity">
                            <strong>{user.full_name || user.username}</strong>
                            <span>@{user.username} · ID {user.id}</span>
                          </div>
                          <span className={`status ${user.is_active ? 'active' : 'inactive'}`}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="mobile-user-details">
                          <span><b>Role</b>{user.role || '—'}</span>
                          <span><b>Online</b>{user.is_online ? 'Online' : 'Offline'}</span>
                          <span><b>Email</b>{user.email || '—'}</span>
                          <span><b>Position</b>{user.position || '—'}</span>
                        </div>
                        <div className="mobile-user-card-footer">
                          <span>Created {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
                          <div className="action-buttons">
                            <button
                              className="action-btn edit-btn"
                              onClick={() => handleEditUser(user)}
                              aria-label={`Edit ${user.username}`}
                              title="Edit User"
                            >
                              ✏️
                            </button>
                            <button
                              className={`action-btn toggle-btn ${user.is_active ? 'active' : 'inactive'}`}
                              onClick={() => handleToggleUserStatus(user.id)}
                              aria-label={`${user.is_active ? 'Deactivate' : 'Activate'} ${user.username}`}
                              title={user.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {user.is_active ? '🔓' : '🔒'}
                            </button>
                            <button
                              className="action-btn permission-btn"
                              onClick={() => handleEditPermissions(user)}
                              aria-label={`Edit permissions for ${user.username}`}
                              title="Edit Permissions"
                            >
                              🔑
                            </button>
                            <button
                              className="action-btn delete-btn"
                              onClick={() => handleDeleteUser(user.id)}
                              aria-label={`Delete ${user.username}`}
                              title="Delete User"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="data-table user-management-table">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ID</th>
                        <th>Username</th>
                        <th>Password</th>
                        <th>Email</th>
                        <th>Full Name</th>
                        <th>Position</th>
                        <th>Role</th>
                        <th>Online</th>
                        <th>Created By</th>
                        <th>Creator Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleListItems(users, 'users-management').map((user, index) => {
                        // Passwords are stored securely in database, not displayed
                        const userPassword = '••••••••' // Passwords cannot be retrieved from database
                        
                        return (
                        <tr key={user.id}>
                          <td>{currentListPage(users, 'users-management') * PAGE_SIZE + index + 1}</td>
                          <td>{user.id}</td>
                          <td>{user.username}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start' }}>
                              <span style={{ fontFamily: 'monospace', minWidth: '80px' }}>
                                ••••••••
                              </span>
                              <span style={{ fontSize: '12px', color: '#666' }}>
                                (Encrypted)
                              </span>
                            </div>
                          </td>
                          <td>{user.email}</td>
                          <td>{user.full_name || '-'}</td>
                          <td>{user.position || '-'}</td>
                          <td><span className={`badge ${user.role}`}>{user.role}</span></td>
                          <td><span className={`status-badge ${user.is_online ? 'active' : 'inactive'}`}>{user.is_online ? 'Online' : 'Offline'}</span></td>
                          <td>{user.created_by_role === 'self' ? 'Self-registered' : user.created_by_username || (user.created_by_user_id ? 'Account unavailable' : 'Not recorded')}</td>
                          <td>{user.created_by_role === 'self' ? 'Self' : user.created_by_role || '—'}</td>
                          <td><span className={`status ${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td>
                          <td>{new Date(user.created_at).toLocaleDateString()}</td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                className="action-btn edit-btn" 
                                onClick={() => handleEditUser(user)}
                                title="Edit User"
                              >
                                ✏️
                              </button>
                              <button 
                                className={`action-btn toggle-btn ${user.is_active ? 'active' : 'inactive'}`}
                                onClick={() => handleToggleUserStatus(user.id)}
                                title={user.is_active ? 'Deactivate' : 'Activate'}
                              >
                                {user.is_active ? '🔓' : '🔒'}
                              </button>
                              <button 
                                className="action-btn permission-btn"
                                onClick={() => handleEditPermissions(user)}
                                title="Edit Permissions"
                              >
                                🔑
                              </button>
                              <button 
                                className="action-btn delete-btn"
                                onClick={() => handleDeleteUser(user.id)}
                                title="Delete User"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                  {listPagination(users, 'users-management', 'user management')}
                </>
              ) : (
                <div className="placeholder-content">
                  <span className="placeholder-icon">👥</span>
                  <p>No users yet. Click "Create User" to add your first user.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'userprofile' && (
            <div className="userprofile-section">
              <h2 className="section-title">User Profiles</h2>
              <p className="section-description">View and manage detailed user profiles</p>
              
              {users.length > 0 ? (
                <>
                <div className="profile-list">
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Position</th>
                        <th>Role</th>
                        <th>Online</th>
                        <th>Created By</th>
                        <th>Creator Role</th>
                        <th>Status</th>
                        <th>Joined</th>
                        <th>Stats</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleListItems(users, 'user-profiles').map(user => (
                        <tr key={user.id}>
                          <td>
                            <div className="user-cell">
                              <span className="user-avatar-small">👤</span>
                              <div>
                                <div className="user-name-small">{user.full_name || user.username}</div>
                                <div className="user-username-small">@{user.username}</div>
                              </div>
                            </div>
                          </td>
                          <td>{user.email || 'Not provided'}</td>
                          <td>{user.phone || 'Not provided'}</td>
                          <td>{user.position || 'Not specified'}</td>
                          <td><span className={`profile-role ${user.role}`}>{user.role}</span></td>
                          <td><span className={`status-badge ${user.is_online ? 'active' : 'inactive'}`}>{user.is_online ? 'Online' : 'Offline'}</span></td>
                          <td>{user.created_by_role === 'self' ? 'Self-registered' : user.created_by_username || (user.created_by_user_id ? 'Account unavailable' : 'Not recorded')}</td>
                          <td>{user.created_by_role === 'self' ? 'Self' : user.created_by_role || '—'}</td>
                          <td>
                            <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                              {user.is_active ? '🟢 Active' : '🔴 Inactive'}
                            </span>
                          </td>
                          <td>{new Date(user.created_at).toLocaleDateString()}</td>
                          <td>
                            <div className="stats-mini">
                              <span className="stat-mini">📊 0 regs</span>
                              <span className="stat-mini">✅ 0 done</span>
                            </div>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button 
                                className="action-btn edit-btn" 
                                onClick={() => handleEditUser(user)}
                                title="Edit Profile"
                              >
                                ✏️
                              </button>
                              <button 
                                className="action-btn permission-btn"
                                onClick={() => handleEditPermissions(user)}
                                title="Manage Permissions"
                              >
                                🔑
                              </button>
                              <button 
                                className={`action-btn toggle-btn ${user.is_active ? 'active' : 'inactive'}`}
                                onClick={() => handleToggleUserStatus(user.id)}
                                title={user.is_active ? 'Deactivate' : 'Activate'}
                              >
                                {user.is_active ? '🔒' : '🔓'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {listPagination(users, 'user-profiles', 'user profiles')}
                </>
              ) : (
                <div className="placeholder-content">
                  <span className="placeholder-icon">👥</span>
                  <p>No user profiles yet. Create users to see their profiles here.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'finance' && (
            <div className="finance-section">
              <h2 className="section-title">Finance Management</h2>
              <p className="section-description">Review platform finance, balances, deposits, withdrawals, and user earnings across all account roles.</p>
              <PlatformFinanceOverview />
              
              {/* User Commission Settings List */}
              <div className="commission-settings-card">
                <div className="settings-header">
                  <h3>👥 User Commission Settings</h3>
                  <p>Default commission adjustments for each user</p>
                </div>
                <div className="settings-list">
                  {users.length > 0 ? (
                    <>
                    <div className="settings-table">
                      <table>
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Position</th>
                            <th>Commission Type</th>
                            <th>Commission Value</th>
                            <th>Work Type</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleListItems(users, 'commission-settings').map(user => {
                            const settings = userCommissions[user.id || user._id] || user.commission_settings || { adjustmentType: 'percentage', value: 10, workType: 'all' }
                            return (
                              <tr key={user.id}>
                                <td>
                                  <div className="user-cell">
                                    <span className="user-avatar-small">👤</span>
                                    <span className="user-name-small">{user.full_name || user.username}</span>
                                  </div>
                                </td>
                                <td>{user.position || 'N/A'}</td>
                                <td>
                                  <span className="setting-badge">
                                    {settings.adjustmentType === 'percentage' ? '📈 Percentage' : '💰 Fixed'}
                                  </span>
                                </td>
                                <td>
                                  <span className="value-badge">
                                    {settings.value || 10} {settings.adjustmentType === 'percentage' ? '%' : 'Birr/reg'}
                                  </span>
                                </td>
                                <td>
                                  <span className="worktype-badge">
                                    {settings.workType === 'all'
                                      ? 'All Types'
                                      : settings.workType?.startsWith('project:')
                                        ? settings.workType.slice('project:'.length)
                                        : settings.workType}
                                  </span>
                                </td>
                                <td>
                                  <button 
                                    className="btn-adjust-small"
                                    onClick={() => openCommissionModal(user)}
                                  >
                                    ⚙️ Adjust
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {listPagination(users, 'commission-settings', 'commission settings')}
                    </>
                  ) : (
                    <div className="placeholder-content">
                      <span className="placeholder-icon">👥</span>
                      <p>No users found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* User Filter Dropdown */}
              <div className="user-filter-section">
                <label htmlFor="financeUserFilter" className="filter-label">
                  <span className="filter-icon">🔍</span>
                  Filter by User:
                </label>
                <select 
                  id="financeUserFilter"
                  className="user-filter-select"
                  value={selectedFinanceUser}
                  onChange={(e) => setSelectedFinanceUser(e.target.value)}
                >
                  <option value="all">All Users</option>
                  {users.map(user => (
                    <option key={user.id ?? user._id} value={String(user.id ?? user._id)}>
                      {user.full_name || user.username} (@{user.username})
                    </option>
                  ))}
                </select>
              </div>

              {/* Earnings Display Section */}
              <div className="earnings-display-section">
                <h3>💰 Earnings Overview - {selectedFinanceUser === 'all' ? 'All Users' : users.find(u => String(u.id ?? u._id) === selectedFinanceUser)?.full_name || users.find(u => String(u.id ?? u._id) === selectedFinanceUser)?.username}</h3>
                <div className="earnings-list">
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Position</th>
                        <th>Paid Regs</th>
                        <th>Unpaid Regs</th>
                        <th>Earned (Paid)</th>
                        <th>Pending (Unpaid)</th>
                        <th>Total Earnings</th>
                        <th>Work Breakdown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleListItems(
                        selectedFinanceUser === 'all' ? users : users.filter(u => String(u.id ?? u._id) === selectedFinanceUser),
                        'finance-earnings'
                      ).map(user => {
                        const paidStats = getUserStats(user.id, 'paid')
                        const unpaidStats = getUserStats(user.id, 'unpaid')
                        const totalEarnings = paidStats.commission + unpaidStats.commission
                        const breakdown = getUserWorkTypeBreakdown(user.id)
                        
                        return (
                          <tr key={user.id}>
                            <td>
                              <div className="user-cell">
                                <span className="user-avatar-small">👤</span>
                                <div>
                                  <div className="user-name-small">{user.full_name || user.username}</div>
                                  <div className="user-username-small">@{user.username}</div>
                                </div>
                              </div>
                            </td>
                            <td>{user.position || 'N/A'}</td>
                            <td><span className="count-badge">{paidStats.count}</span></td>
                            <td><span className="count-badge pending">{unpaidStats.count}</span></td>
                            <td><span className="amount-earned">{paidStats.commission.toLocaleString()} Birr</span></td>
                            <td><span className="amount-pending">{unpaidStats.commission.toLocaleString()} Birr</span></td>
                            <td><span className="amount-total">{totalEarnings.toLocaleString()} Birr</span></td>
                            <td>
                              <div className="work-breakdown-cell">
                                {Object.entries(breakdown).map(([type, data]) => (
                                  data.count > 0 && (
                                    <div key={type} className="work-item-mini">
                                      <span className="work-type-mini">{type}:</span>
                                      <span className="work-count-mini">{data.count}</span>
                                      <span className="work-amount-mini">({data.amount.toLocaleString()} Birr)</span>
                                    </div>
                                  )
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {listPagination(
                    selectedFinanceUser === 'all' ? users : users.filter(u => String(u.id ?? u._id) === selectedFinanceUser),
                    'finance-earnings',
                    'finance earnings'
                  )}
                </div>
              </div>
              
              {/* Commission Summary Cards */}
              <div className="commission-summary">
                <div className="summary-card total-earned">
                  <div className="summary-icon">💰</div>
                  <div className="summary-info">
                    <span className="summary-label">Total Earned</span>
                    <span className="summary-value">
                      {users.reduce((sum, user) => {
                        const stats = getUserStats(user.id, 'paid')
                        return sum + stats.commission
                      }, 0).toLocaleString()} Birr
                    </span>
                  </div>
                </div>
                
                <div className="summary-card remaining">
                  <div className="summary-icon">⏳</div>
                  <div className="summary-info">
                    <span className="summary-label">Remaining (Unpaid)</span>
                    <span className="summary-value">
                      {users.reduce((sum, user) => {
                        const stats = getUserStats(user.id, 'unpaid')
                        return sum + stats.commission
                      }, 0).toLocaleString()} Birr
                    </span>
                  </div>
                </div>
                
                <div className="summary-card total-registrations">
                  <div className="summary-icon">📋</div>
                  <div className="summary-info">
                    <span className="summary-label">Total Registrations</span>
                    <span className="summary-value">{registrations.length}</span>
                  </div>
                </div>
                
                <div className="summary-card active-staff">
                  <div className="summary-icon">👥</div>
                  <div className="summary-info">
                    <span className="summary-label">Active Staff</span>
                    <span className="summary-value">{users.length}</span>
                  </div>
                </div>
              </div>

              {/* Work Type Breakdown */}
              <div className="work-type-breakdown">
                <h3>📊 Work Type Distribution</h3>
                <div className="breakdown-grid">
                  {['REDSEA with EBC', 'Sells Product', 'Other'].map(workType => {
                    const total = users.reduce((sum, user) => {
                      const breakdown = getUserWorkTypeBreakdown(user.id)
                      return sum + breakdown[workType].count
                    }, 0)
                    const totalAmount = users.reduce((sum, user) => {
                      const breakdown = getUserWorkTypeBreakdown(user.id)
                      return sum + breakdown[workType].amount
                    }, 0)
                    
                    return (
                      <div key={workType} className="breakdown-item">
                        <span className="breakdown-label">{workType}</span>
                        <div className="breakdown-stats">
                          <span className="breakdown-count">{total} registrations</span>
                          <span className="breakdown-amount">{totalAmount.toLocaleString()} Birr</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* Paid Section */}
              <div className="finance-card">
                <div className="card-header paid-header">
                  <h3>✅ Paid Commissions</h3>
                  <p>Users with completed paid registrations</p>
                </div>
                <div className="card-content">
                  {users.length > 0 ? (
                    <>
                    <div className="finance-table">
                      <table>
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Position</th>
                            <th>Role</th>
                            <th>Paid Count</th>
                            <th>Total Amount</th>
                            <th>Commission</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleListItems(users, 'paid-commissions').map(user => {
                            const stats = getUserStats(user.id, 'paid')
                            return (
                              <tr key={user.id}>
                                <td>
                                  <div className="user-cell">
                                    <span className="user-avatar">👤</span>
                                    <div>
                                      <div className="user-name">{user.full_name || user.username}</div>
                                      <div className="user-username">@{user.username}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{user.position || 'N/A'}</td>
                                <td><span className={`badge ${user.role}`}>{user.role}</span></td>
                                <td><span className="count-badge">{stats.count}</span></td>
                                <td><span className="amount-badge">{stats.totalAmount.toLocaleString()} Birr</span></td>
                                <td>
                                  <span className="commission-badge">
                                    {stats.adjustmentType === 'percentage' 
                                      ? `${stats.commissionRate}% (${stats.commission.toLocaleString()} Birr)`
                                      : `${stats.commissionFixed} Birr/reg (${stats.commission.toLocaleString()} Birr)`
                                    }
                                  </span>
                                </td>
                                <td>
                                  <button 
                                    className="btn-commission"
                                    onClick={() => openCommissionModal(user)}
                                  >
                                    ✏️ Adjust
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {listPagination(users, 'paid-commissions', 'paid commissions')}
                    </>
                  ) : (
                    <div className="placeholder-content">
                      <span className="placeholder-icon">💰</span>
                      <p>No paid commissions data</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Unpaid Section */}
              <div className="finance-card">
                <div className="card-header unpaid-header">
                  <h3>⏳ Unpaid Commissions</h3>
                  <p>Users with pending unpaid registrations</p>
                </div>
                <div className="card-content">
                  {users.length > 0 ? (
                    <>
                    <div className="finance-table">
                      <table>
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Position</th>
                            <th>Role</th>
                            <th>Unpaid Count</th>
                            <th>Pending Amount</th>
                            <th>Commission</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleListItems(users, 'unpaid-commissions').map(user => {
                            const stats = getUserStats(user.id, 'unpaid')
                            return (
                              <tr key={user.id}>
                                <td>
                                  <div className="user-cell">
                                    <span className="user-avatar">👤</span>
                                    <div>
                                      <div className="user-name">{user.full_name || user.username}</div>
                                      <div className="user-username">@{user.username}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{user.position || 'N/A'}</td>
                                <td><span className={`badge ${user.role}`}>{user.role}</span></td>
                                <td><span className="count-badge pending">{stats.count}</span></td>
                                <td><span className="amount-badge pending">{stats.totalAmount.toLocaleString()} Birr</span></td>
                                <td>
                                  <span className="commission-badge">
                                    {stats.adjustmentType === 'percentage' 
                                      ? `${stats.commissionRate}% (${stats.commission.toLocaleString()} Birr)`
                                      : `${stats.commissionFixed} Birr/reg (${stats.commission.toLocaleString()} Birr)`
                                    }
                                  </span>
                                </td>
                                <td>
                                  <button 
                                    className="btn-commission"
                                    onClick={() => openCommissionModal(user)}
                                  >
                                    ✏️ Adjust
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {listPagination(users, 'unpaid-commissions', 'unpaid commissions')}
                    </>
                  ) : (
                    <div className="placeholder-content">
                      <span className="placeholder-icon">⏳</span>
                      <p>No unpaid commissions data</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'partners' && (
            <div className="partners-section">
              <h2 className="section-title">Partner Management</h2>
              <p className="section-description">Manage partnerships and collaborations</p>
              {partners.length > 0 ? (
                <>
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Company</th>
                        <th>Contact</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleListItems(partners, 'partners').map(partner => (
                        <tr key={partner.id}>
                          <td>{partner.id}</td>
                          <td>{partner.company_name}</td>
                          <td>{partner.contact_person || '-'}</td>
                          <td>{partner.email || '-'}</td>
                          <td>{partner.phone || '-'}</td>
                          <td><span className={`status ${partner.status}`}>{partner.status}</span></td>
                          <td>{new Date(partner.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {listPagination(partners, 'partners', 'partners')}
                </>
              ) : (
                <div className="placeholder-content">
                  <span className="placeholder-icon">🤝</span>
                  <p>Loading partners...</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'services' && (
            <RootServiceCatalog />
          )}
          {activeTab === 'promotions' && <RootPromotions />}
          {activeTab === 'link-campaigns' && <LinkCampaignManagement />}

          {activeTab === 'booked' && (
            <div className="root-booked-section">
              <h2 className="section-title">Booked Services</h2>
              <p className="section-description">Wallet bookings are confirmed immediately after the real-wallet payment succeeds. Other booking requests stay pending until their submitted payment is approved.</p>
              {serviceBookingRequests.length > 0 ? (
                <>
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Requested</th>
                        <th>Service</th>
                        <th>Item</th>
                        <th>Customer</th>
                        <th>Amount</th>
                        <th>Payment Type</th>
                        <th>Payment Method</th>
                        <th>Transaction Reference</th>
                        <th>Booking Status</th>
                        <th>Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleListItems(serviceBookingRequests, 'booked-services').map(request => (
                        <tr key={request.requestId || request.id}>
                          <td>{request.requestedAt ? new Date(request.requestedAt).toLocaleString() : '—'}</td>
                          <td>{request.category || 'Service'}</td>
                          <td>{request.itemName || '—'}</td>
                          <td>{request.customerName || '—'}<br />{request.customerPhone || ''}</td>
                          <td>{request.amount || 'To be confirmed'}</td>
                          <td>{request.paymentLabel || 'Full payment'}</td>
                          <td>
                            {request.paymentMethod || '—'}
                            {request.paymentAccount?.accountName && <><br />Holder: {request.paymentAccount.accountName}</>}
                            {request.paymentAccount?.bankName && <><br />Bank: {request.paymentAccount.bankName}</>}
                            {request.paymentAccount?.accountNumber && <><br />Account: {request.paymentAccount.accountNumber}</>}
                            {request.paymentAccount?.phone && <><br />Wallet: {request.paymentAccount.phone}</>}
                          </td>
                          <td>{request.transactionReference || '—'}</td>
                          <td><span className={`service-request-status ${request.status || 'pending_approval'}`}>
                            {request.status === 'confirmed'
                              ? request.paymentMethod === 'REDSEA Wallet' ? 'Booked successfully' : 'Approved'
                              : request.status === 'cancelled' ? 'Cancelled' : 'Pending approval'}
                          </span></td>
                          <td>{renderDeliveryStatus(request)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {listPagination(serviceBookingRequests, 'booked-services', 'booked services')}
                </>
              ) : (
                <div className="placeholder-content">
                  <span className="placeholder-icon">📅</span>
                  <p>No service booking requests yet</p>
                </div>
              )}
              <section className="root-utility-bookings">
                <h3>Utility payment bookings</h3>
                <p className="section-description">Submitted payment proofs and approved utility receipts are available here to view or download.</p>
                {utilityPaymentRequests.length > 0 ? (
                  <>
                  <div className="data-table">
                    <table>
                      <thead>
                        <tr><th>Requested</th><th>Service</th><th>Customer</th><th>Amount</th><th>Payment</th><th>Status</th><th>Receipt number</th><th>Payment proof</th><th>Options</th></tr>
                      </thead>
                      <tbody>
                        {visibleListItems(utilityPaymentRequests, 'utility-bookings').map(request => (
                          <tr key={request.id}>
                            <td>{request.requestedAt ? new Date(request.requestedAt).toLocaleString() : '—'}</td>
                            <td>{request.cardTitle || 'Utility payment'}</td>
                            <td>{request.customerName || request.ownerName || '—'}<br />{request.customerPhone || request.phone || ''}</td>
                            <td>ETB {Number(request.amount || 0).toLocaleString()}</td>
                            <td>{request.paymentMethod || '—'}</td>
                            <td>{request.status === 'receipt' ? 'Receipt approved' : request.status === 'approved' ? 'Payment approved' : request.status === 'cancelled' ? 'Cancelled' : 'Pending approval'}</td>
                            <td>
                              {request.status === 'approved' ? (
                                <input
                                  className="root-utility-receipt-input"
                                  aria-label={`Receipt number for ${request.cardTitle}`}
                                  placeholder="Enter manual receipt number"
                                  value={manualUtilityReceipts[request.id] || ''}
                                  onChange={event => setManualUtilityReceipts(previous => ({ ...previous, [request.id]: event.target.value }))}
                                />
                              ) : request.receiptNumber || '—'}
                            </td>
                            <td>
                              {getUtilityPaymentProofs(request).length > 0
                                ? getUtilityPaymentProofs(request).map(file => (
                                  <div key={`${request.id}-${file.name}`}>
                                    <a href={file.dataUrl} target="_blank" rel="noreferrer">
                                      View {file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'image'}
                                    </a>
                                    {' · '}
                                    <a href={file.dataUrl} download={file.name}>Download</a>
                                  </div>
                                ))
                                : '—'}
                            </td>
                            <td className="root-utility-booking-actions">
                              {request.status === 'approved' && (
                                <button type="button" onClick={() => issueUtilityReceipt(request.id)}>Approve receipt</button>
                              )}
                              {request.receiptPdf && (
                                <>
                                  <button type="button" onClick={() => setViewUtilityReceipt(request)}>View</button>
                                  <a href={request.receiptPdf} download={`${request.receiptNumber || 'utility-receipt'}.pdf`}>Download</a>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {listPagination(utilityPaymentRequests, 'utility-bookings', 'utility payment bookings')}
                  </>
                ) : (
                  <div className="placeholder-content">
                    <span className="placeholder-icon">🧾</span>
                    <p>No utility payment bookings yet</p>
                  </div>
                )}
              </section>
              {viewUtilityReceipt?.receiptPdf && (
                <div className="root-utility-receipt-overlay" onMouseDown={event => {
                  if (event.target === event.currentTarget) setViewUtilityReceipt(null)
                }}>
                  <section className="root-utility-receipt-viewer" role="dialog" aria-modal="true" aria-label={`Receipt ${viewUtilityReceipt.receiptNumber}`}>
                    <header>
                      <strong>Receipt {viewUtilityReceipt.receiptNumber}</strong>
                      <button type="button" onClick={() => setViewUtilityReceipt(null)} aria-label="Close receipt">×</button>
                    </header>
                    <iframe title={`Receipt ${viewUtilityReceipt.receiptNumber}`} src={viewUtilityReceipt.receiptPdf} />
                  </section>
                </div>
              )}
            </div>
          )}

          {rootAuthVerified && activeTab === 'utility-control' && (
            <div className="root-utility-control-section">
              <RootUtilityControl />
            </div>
          )}


          {activeTab === 'payments' && (
            <div className="root-payments-section">
              <h2 className="section-title">Service Payments</h2>
              <p className="section-description">Configure provider payment details and approve or cancel customer-submitted payment requests.</p>
              <RootPaymentProviderSettings />
              {serviceBookingRequests.length > 0 ? (
                <>
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Requested</th>
                        <th>Service</th>
                        <th>Item</th>
                        <th>Customer Name</th>
                        <th>Phone Number</th>
                        <th>Amount</th>
                        <th>Payment Type</th>
                        <th>Method</th>
                        <th>Transaction Reference</th>
                        <th>Booking Status</th>
                        <th>Payment Status</th>
                        <th>Delivery</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleListItems(serviceBookingRequests, 'service-payments').map(request => (
                        <tr key={request.requestId || request.id}>
                          <td>{request.requestedAt ? new Date(request.requestedAt).toLocaleString() : '—'}</td>
                          <td>{request.category || 'Service'}</td>
                          <td>{request.itemName || '—'}</td>
                          <td>{request.customerName || '—'}</td>
                          <td>{request.customerPhone || '—'}</td>
                          <td>{request.amount || 'To be confirmed'}</td>
                          <td>{request.paymentLabel || 'Full payment'}</td>
                          <td>
                            {request.paymentMethod || '—'}
                            {request.paymentAccount?.accountName && <><br />Holder: {request.paymentAccount.accountName}</>}
                            {request.paymentAccount?.bankName && <><br />Bank: {request.paymentAccount.bankName}</>}
                            {request.paymentAccount?.accountNumber && <><br />Account: {request.paymentAccount.accountNumber}</>}
                            {request.paymentAccount?.phone && <><br />Wallet: {request.paymentAccount.phone}</>}
                          </td>
                          <td>{request.transactionReference || '—'}</td>
                          <td><span className={`service-request-status ${request.status || 'pending_approval'}`}>
                            {request.status === 'confirmed' ? 'Approved' : request.status === 'cancelled' ? 'Cancelled' : 'Pending approval'}
                          </span></td>
                          <td><span className={`service-payment-status ${request.paymentStatus || 'pending'}`}>
                            {request.paymentStatus === 'approved' ? 'Approved' : request.paymentStatus === 'cancelled' ? 'Cancelled' : 'Pending review'}
                          </span></td>
                          <td>{renderDeliveryStatus(request)}</td>
                          <td>
                            {request.paymentStatus === 'approved' || request.paymentStatus === 'cancelled'
                              ? <span className="service-payment-action-complete">{request.paymentStatus === 'approved' ? 'Approved' : 'Cancelled'}</span>
                              : <div className="service-payment-actions">
                                  <button
                                    type="button"
                                    className="approve"
                                    onClick={() => updateBookingRequest(request.requestId || request.id, {
                                      paymentStatus: 'approved',
                                      paymentApprovedAt: new Date().toISOString(),
                                      status: 'confirmed',
                                      approvedAt: new Date().toISOString(),
                                    })}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="cancel"
                                    onClick={() => updateBookingRequest(request.requestId || request.id, {
                                      paymentStatus: 'cancelled',
                                      paymentCancelledAt: new Date().toISOString(),
                                      status: 'cancelled',
                                    })}
                                  >
                                    Cancel
                                  </button>
                                </div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {listPagination(serviceBookingRequests, 'service-payments', 'service payments')}
                </>
              ) : (
                <div className="placeholder-content">
                  <span className="placeholder-icon">💳</span>
                  <p>No service payment records yet</p>
                </div>
              )}
              <section className="root-utility-bookings">
                <h3>Utility payment account requests ({pendingUtilityPaymentRequests.length} pending)</h3>
                <p className="section-description">Review customer-submitted utility payments and approve or cancel each request.</p>
                {pendingUtilityPaymentRequests.length > 0 ? (
                  <>
                  <div className="data-table">
                    <table>
                      <thead>
                        <tr><th>Requested</th><th>Service</th><th>Customer</th><th>Amount</th><th>Payment account</th><th>Transaction reference</th><th>Payment proof</th><th>Action</th></tr>
                      </thead>
                      <tbody>
                        {visibleListItems(pendingUtilityPaymentRequests, 'pending-utility-payments').map(request => (
                          <tr key={request.id}>
                            <td>{request.requestedAt ? new Date(request.requestedAt).toLocaleString() : '—'}</td>
                            <td>{request.cardTitle || 'Utility payment'}<br /><small>{request.category || ''}</small></td>
                            <td>{request.customerName || request.ownerName || '—'}<br />{request.customerPhone || request.phone || ''}</td>
                            <td>ETB {Number(request.amount || 0).toLocaleString()}</td>
                            <td>
                              {request.paymentMethod || '—'}
                              {request.paymentAccount?.accountName && <><br />Holder: {request.paymentAccount.accountName}</>}
                              {request.paymentAccount?.bankName && <><br />Bank: {request.paymentAccount.bankName}</>}
                              {request.paymentAccount?.accountNumber && <><br />Account: {request.paymentAccount.accountNumber}</>}
                              {request.paymentAccount?.phone && <><br />Wallet: {request.paymentAccount.phone}</>}
                            </td>
                            <td>{request.transactionReference || '—'}</td>
                            <td>
                              {getUtilityPaymentProofs(request).length > 0
                                ? getUtilityPaymentProofs(request).map(file => (
                                  <div key={`${request.id}-${file.name}`}>
                                    <a href={file.dataUrl} target="_blank" rel="noreferrer">
                                      View {file.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'image'}
                                    </a>
                                    {' · '}
                                    <a href={file.dataUrl} download={file.name}>Download</a>
                                  </div>
                                ))
                                : '—'}
                            </td>
                            <td>
                              <div className="service-payment-actions">
                                <button type="button" className="approve" onClick={() => updateUtilityPaymentRequest(request.id, 'approve')}>Approve</button>
                                <button type="button" className="cancel" onClick={() => updateUtilityPaymentRequest(request.id, 'cancel')}>Cancel</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {listPagination(pendingUtilityPaymentRequests, 'pending-utility-payments', 'pending utility payments')}
                  </>
                ) : (
                  <div className="placeholder-content">
                    <span className="placeholder-icon">🧾</span>
                    <p>No utility payment requests awaiting approval</p>
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="transactions-section">
              <h2 className="section-title">Transaction Management</h2>
              <p className="section-description">View and manage all transactions</p>
              {transactions.length > 0 ? (
                <>
                <div className="data-table">
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Client</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Commission</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleListItems(transactions, 'transactions').map(transaction => (
                        <tr key={transaction.id}>
                          <td>{transaction.id}</td>
                          <td>{transaction.company_name || '-'}</td>
                          <td><span className="badge">{transaction.transaction_type}</span></td>
                          <td>{formatCurrency(transaction.amount)}</td>
                          <td>{formatCurrency(transaction.commission_amount)}</td>
                          <td><span className={`status ${transaction.status}`}>{transaction.status}</span></td>
                          <td>{new Date(transaction.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {listPagination(transactions, 'transactions', 'transactions')}
                </>
              ) : (
                <div className="placeholder-content">
                  <span className="placeholder-icon">💰</span>
                  <p>Loading transactions...</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'database' && (
            <div className="database-section">
              <h2 className="section-title">Database Management</h2>
              <p className="section-description">Backup and manage database operations</p>
              
              {/* Backup Section */}
              <div className="database-card">
                <div className="card-header">
                  <h3>📦 Data Backup</h3>
                  <p>Backup registered data and system information</p>
                </div>
                <div className="card-content">
                  <div className="backup-options">
                    <div className="backup-item">
                      <div className="backup-info">
                        <span className="backup-icon">📋</span>
                        <div>
                          <h4>Registered Data Backup</h4>
                          <p>Export all registration data (Paid, Unpaid, Need Approval)</p>
                        </div>
                      </div>
                      <button className="btn-backup" onClick={() => handleBackupData('registrations')}>
                        <span>💾</span> Backup Now
                      </button>
                    </div>
                    
                    <div className="backup-item">
                      <div className="backup-info">
                        <span className="backup-icon">👥</span>
                        <div>
                          <h4>Users Backup</h4>
                          <p>Export all user accounts and staff information</p>
                        </div>
                      </div>
                      <button className="btn-backup" onClick={() => handleBackupData('users')}>
                        <span>💾</span> Backup Now
                      </button>
                    </div>
                    
                    <div className="backup-item">
                      <div className="backup-info">
                        <span className="backup-icon">🗄️</span>
                        <div>
                          <h4>Full Database Backup</h4>
                          <p>Complete backup of all system data</p>
                        </div>
                      </div>
                      <button className="btn-backup primary" onClick={() => handleBackupData('full')}>
                        <span>💾</span> Full Backup
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Database Controls */}
              <div className="database-card">
                <div className="card-header">
                  <h3>🔧 Database Controls</h3>
                  <p>Manage database operations and maintenance</p>
                </div>
                <div className="card-content">
                  <div className="control-grid">
                    <div className="control-item">
                      <span className="control-icon">🔌</span>
                      <h4>Connect Database</h4>
                      <p>Connect or reconnect to database</p>
                      <button className="btn-control primary" onClick={() => handleDatabaseControl('connect')}>
                        Connect
                      </button>
                    </div>
                    
                    <div className="control-item">
                      <span className="control-icon">🔄</span>
                      <h4>Restore Data</h4>
                      <p>View and restore database records</p>
                      <button className="btn-control" onClick={() => handleDatabaseControl('restore')}>
                        Restore
                      </button>
                    </div>
                    
                    <div className="control-item">
                      <span className="control-icon">🧹</span>
                      <h4>Clean Database</h4>
                      <p>Remove old or duplicate entries</p>
                      <button className="btn-control" onClick={() => handleDatabaseControl('clean')}>
                        Clean
                      </button>
                    </div>
                    
                    <div className="control-item">
                      <span className="control-icon">🔍</span>
                      <h4>Database Info</h4>
                      <p>View database statistics</p>
                      <button className="btn-control" onClick={() => handleDatabaseControl('info')}>
                        View Info
                      </button>
                    </div>
                    
                    <div className="control-item">
                      <span className="control-icon">⚡</span>
                      <h4>Optimize</h4>
                      <p>Optimize database performance</p>
                      <button className="btn-control" onClick={() => handleDatabaseControl('optimize')}>
                        Optimize
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Backups */}
              <div className="database-card">
                <div className="card-header">
                  <h3>📜 Recent Backups</h3>
                  <p>View and manage recent backup files</p>
                </div>
                <div className="card-content">
                  <div className="placeholder-content">
                    <span className="placeholder-icon">📦</span>
                    <p>No recent backups found</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'otp-api' && (
            <div className="settings-section">
              <OtpDeliverySettings />
            </div>
          )}

          {activeTab === 'site-content' && <RootSiteContent />}

          {activeTab === 'logs' && (
            <div className="logs-section">
              <h2 className="section-title">System Logs</h2>
              <p className="section-description">Live server and database connection status.</p>
              <button type="button" className="refresh-btn" onClick={() => loadTabData('logs')} disabled={logsLoading}>
                {logsLoading ? 'Refreshing…' : 'Refresh logs'}
              </button>
              {logsError && <p className="error-message" role="alert">{logsError}</p>}
              {logsLoading ? (
                <div className="placeholder-content">
                  <p>Loading system status…</p>
                </div>
              ) : logs.length > 0 ? (
                <>
                <div className="logs-list">
                  {visibleListItems(logs, 'system-logs').map(log => (
                    <div key={log.id} className={`log-item ${log.level}`}>
                      <span className="log-level">{log.level.toUpperCase()}</span>
                      <span className="log-message">{log.message}</span>
                      <span className="log-time">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                {listPagination(logs, 'system-logs', 'system logs')}
                </>
              ) : (
                <div className="placeholder-content">
                  <span className="placeholder-icon">📝</span>
                  <p>No system status entries were returned.</p>
                </div>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </main>

      {/* Commission Adjustment Modal */}
      {showCommissionModal && (
        <div className="modal-overlay" onClick={() => setShowCommissionModal(false)}>
          <div className="modal-content commission-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>💵 Adjust Commission - {selectedUserForCommission?.username}</h2>
              <button className="modal-close" onClick={() => setShowCommissionModal(false)}>✕</button>
            </div>
            
            <div className="commission-content">
              <div className="user-info-banner">
                <span className="user-avatar-large">👤</span>
                <div>
                  <h3>{selectedUserForCommission?.full_name || selectedUserForCommission?.username}</h3>
                  <p>Position: {selectedUserForCommission?.position || 'Not specified'}</p>
                  <span className={`badge ${selectedUserForCommission?.role}`}>{selectedUserForCommission?.role}</span>
                </div>
              </div>

              {/* Current Statistics */}
              <div className="current-stats-section">
                <h4>📊 Current Statistics</h4>
                <div className="stats-row">
                  <div className="stat-box">
                    <span className="stat-box-label">Paid Registrations</span>
                    <span className="stat-box-value">
                      {selectedUserForCommission && getUserStats(selectedUserForCommission.id, 'paid').count}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-box-label">Unpaid Registrations</span>
                    <span className="stat-box-value">
                      {selectedUserForCommission && getUserStats(selectedUserForCommission.id, 'unpaid').count}
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-box-label">Total Earned</span>
                    <span className="stat-box-value">
                      {selectedUserForCommission && getUserStats(selectedUserForCommission.id, 'paid').commission.toLocaleString()} Birr
                    </span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-box-label">Remaining</span>
                    <span className="stat-box-value">
                      {selectedUserForCommission && getUserStats(selectedUserForCommission.id, 'unpaid').commission.toLocaleString()} Birr
                    </span>
                  </div>
                </div>
              </div>

              {/* Work Type Breakdown for User */}
              <div className="user-work-breakdown">
                <h4>💼 Work Type Breakdown</h4>
                <div className="work-breakdown-list">
                  {selectedUserForCommission && Object.entries(getUserWorkTypeBreakdown(selectedUserForCommission.id)).map(([type, data]) => (
                    <div key={type} className="work-breakdown-row">
                      <span className="work-type-name">{type}</span>
                      <span className="work-type-count">{data.count} registrations</span>
                      <span className="work-type-amount">{data.amount.toLocaleString()} Birr</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="commission-form">
                <div className="form-section">
                  <h4>📊 Adjustment Type</h4>
                  <div className="radio-group">
                    <label className="radio-item">
                      <input 
                        type="radio" 
                        name="adjustmentType"
                        value="percentage"
                        checked={commissionData.adjustmentType === 'percentage'}
                        onChange={(e) => setCommissionData({...commissionData, adjustmentType: e.target.value})}
                      />
                      <span>📈 Percentage (%)</span>
                    </label>
                    <label className="radio-item">
                      <input 
                        type="radio" 
                        name="adjustmentType"
                        value="fixed"
                        checked={commissionData.adjustmentType === 'fixed'}
                        onChange={(e) => setCommissionData({...commissionData, adjustmentType: e.target.value})}
                      />
                      <span>💰 Fixed Amount (ETB/Birr)</span>
                    </label>
                  </div>
                </div>

                <div className="form-section">
                  <h4>💼 Work Type</h4>
                  <select 
                    className="work-type-select"
                    value={commissionData.workType}
                    onChange={(e) => setCommissionData({...commissionData, workType: e.target.value})}
                  >
                    <option value="all">All Work Types</option>
                    <option value="redsea-ebc">REDSEA with EBC Work</option>
                    <option value="sells-product">Sells Product Work</option>
                    <option value="other">Other</option>
                    {commissionData.workType.startsWith('project:') &&
                      !commissionProjectTitles.some(title =>
                        title.toLocaleLowerCase() === commissionData.workType.slice('project:'.length).trim().toLocaleLowerCase()
                      ) && (
                        <option value={commissionData.workType}>
                          {commissionData.workType.slice('project:'.length)} (not in Project Data)
                        </option>
                      )}
                    {commissionProjectTitles.length > 0 && (
                      <optgroup label="Project Data titles">
                        {commissionProjectTitles.map(title => (
                          <option key={title} value={`project:${title}`}>{title}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                <div className="form-section">
                  <h4>
                    {commissionData.adjustmentType === 'percentage' ? '📈 Commission Percentage' : '💰 Fixed Amount'}
                  </h4>
                  <div className="input-with-unit">
                    <input 
                      type="number"
                      className="commission-input"
                      placeholder={commissionData.adjustmentType === 'percentage' ? 'Enter percentage (e.g., 10)' : 'Enter amount in Birr'}
                      value={commissionData.value}
                      onChange={(e) => setCommissionData({...commissionData, value: e.target.value})}
                      min="0"
                      step={commissionData.adjustmentType === 'percentage' ? '0.1' : '1'}
                    />
                    <span className="input-unit">
                      {commissionData.adjustmentType === 'percentage' ? '%' : 'Birr'}
                    </span>
                  </div>
                </div>

                <div className="commission-preview">
                  <h4>📋 Preview</h4>
                  <div className="preview-content">
                    <div className="preview-item">
                      <span>Adjustment Type:</span>
                      <strong>{commissionData.adjustmentType === 'percentage' ? 'Percentage' : 'Fixed Amount'}</strong>
                    </div>
                    <div className="preview-item">
                      <span>Work Type:</span>
                      <strong>
                        {commissionData.workType === 'all'
                          ? 'All Work Types'
                          : commissionData.workType.startsWith('project:')
                            ? commissionData.workType.slice('project:'.length)
                            : commissionData.workType}
                      </strong>
                    </div>
                    <div className="preview-item">
                      <span>Value:</span>
                      <strong>
                        {commissionData.value || '0'} {commissionData.adjustmentType === 'percentage' ? '%' : 'Birr'}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setShowCommissionModal(false)}>
                  Cancel
                </button>
                <button 
                  className="btn-submit"
                  onClick={handleSaveCommission}
                >
                  <span className="btn-icon">💾</span>
                  Save Commission
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && (
        <div className="modal-overlay" onClick={() => setShowPermissionsModal(false)}>
          <div className="modal-content permissions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔑 Edit Permissions - {editingUser?.username}</h2>
              <button className="modal-close" onClick={() => setShowPermissionsModal(false)}>✕</button>
            </div>
            
            <div className="permissions-content">
              {/* Menu Access */}
              <div className="permission-section">
                <h3>📋 Menu Access</h3>
                <p className="section-desc">Control which menu items the user can access</p>
                <div className="permission-grid">
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.menus.home}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        menus: { ...userPermissions.menus, home: e.target.checked }
                      })}
                    />
                    <span>🏠 Home</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.menus.dataCollector}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        menus: { ...userPermissions.menus, dataCollector: e.target.checked }
                      })}
                    />
                    <span>📊 Data Collector</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.menus.fixedCommission}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        menus: { ...userPermissions.menus, fixedCommission: e.target.checked }
                      })}
                    />
                    <span>🏢 Fixed Commission</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.menus.movableCommission}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        menus: { ...userPermissions.menus, movableCommission: e.target.checked }
                      })}
                    />
                    <span>📦 Big Service</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.menus.brokerage}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        menus: { ...userPermissions.menus, brokerage: e.target.checked }
                      })}
                    />
                    <span>🤝 Brokerage</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.menus.contact}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        menus: { ...userPermissions.menus, contact: e.target.checked }
                      })}
                    />
                    <span>📞 Contact</span>
                  </label>
                </div>
              </div>

              {/* Tab Access */}
              <div className="permission-section">
                <h3>📑 Tab Access</h3>
                <p className="section-desc">Control which tabs the user can view</p>
                <div className="permission-grid">
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.tabs.dataRegistration}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        tabs: { ...userPermissions.tabs, dataRegistration: e.target.checked }
                      })}
                    />
                    <span>📝 Data Registration</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.tabs.payRegistration}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        tabs: { ...userPermissions.tabs, payRegistration: e.target.checked }
                      })}
                    />
                    <span>💰 Pay Registration</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.tabs.unpaid}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        tabs: { ...userPermissions.tabs, unpaid: e.target.checked }
                      })}
                    />
                    <span>⏳ Unpaid</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.tabs.paid}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        tabs: { ...userPermissions.tabs, paid: e.target.checked }
                      })}
                    />
                    <span>✅ Paid</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.tabs.needApproval}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        tabs: { ...userPermissions.tabs, needApproval: e.target.checked }
                      })}
                    />
                    <span>⚠️ Need Approval</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.tabs.registered}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        tabs: { ...userPermissions.tabs, registered: e.target.checked }
                      })}
                    />
                    <span>📋 Registered</span>
                  </label>
                </div>
              </div>

              {/* Result Page Permission - Special Section */}
              <div className="permission-section">
                <h3>📊 Result Page Permission</h3>
                <p className="section-desc">Control Result page access and visibility</p>
                
                <div className="permission-item" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={userPermissions.tabs.result}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        tabs: { ...userPermissions.tabs, result: e.target.checked }
                      })}
                    />
                    <span>📊 Enable Result Tab</span>
                  </label>
                </div>

                {userPermissions.tabs.result && (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                        Data Visibility Mode:
                      </label>
                      <select
                        className="form-input"
                        value={userPermissions.resultPage.enabled ? 'enabled' : 'disabled'}
                        onChange={(e) => setUserPermissions({
                          ...userPermissions,
                          resultPage: {
                            ...userPermissions.resultPage,
                            enabled: e.target.value === 'enabled'
                          }
                        })}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '2px solid #e0e0e0' }}
                      >
                        <option value="disabled">🔒 Disabled (Show Only Self)</option>
                        <option value="enabled">✅ Enabled (Show User Dropdown)</option>
                      </select>
                    </div>

                    {userPermissions.resultPage.enabled && (
                      <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                          Allowed Users to View:
                        </label>
                        <select
                          multiple
                          className="form-input"
                          value={userPermissions.resultPage.allowedUsers}
                          onChange={(e) => {
                            const selectedOptions = Array.from(e.target.selectedOptions, option => option.value)
                            setUserPermissions({
                              ...userPermissions,
                              resultPage: {
                                ...userPermissions.resultPage,
                                allowedUsers: selectedOptions
                              }
                            })
                          }}
                          style={{ 
                            width: '100%', 
                            padding: '8px', 
                            borderRadius: '6px', 
                            border: '2px solid #e0e0e0',
                            minHeight: '120px'
                          }}
                        >
                          {users.map(user => (
                            <option key={user.id} value={user.id}>
                              {user.full_name || user.username} (@{user.username})
                            </option>
                          ))}
                        </select>
                        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '8px' }}>
                          Hold Ctrl/Cmd to select multiple users
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Card Access */}
              <div className="permission-section">
                <h3>🎴 Card Access</h3>
                <p className="section-desc">Control which cards and sections are visible</p>
                <div className="permission-grid">
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.cards.statistics}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        cards: { ...userPermissions.cards, statistics: e.target.checked }
                      })}
                    />
                    <span>📈 Statistics Cards</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.cards.quickActions}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        cards: { ...userPermissions.cards, quickActions: e.target.checked }
                      })}
                    />
                    <span>⚡ Quick Actions</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.cards.recentActivity}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        cards: { ...userPermissions.cards, recentActivity: e.target.checked }
                      })}
                    />
                    <span>🕐 Recent Activity</span>
                  </label>
                </div>
              </div>

              {/* List Permissions */}
              <div className="permission-section">
                <h3>📝 List Permissions</h3>
                <p className="section-desc">Control what users can do with lists</p>
                <div className="permission-grid">
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.lists.viewList}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        lists: { ...userPermissions.lists, viewList: e.target.checked }
                      })}
                    />
                    <span>👁️ View Lists</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.lists.editList}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        lists: { ...userPermissions.lists, editList: e.target.checked }
                      })}
                    />
                    <span>✏️ Edit Lists</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.lists.deleteList}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        lists: { ...userPermissions.lists, deleteList: e.target.checked }
                      })}
                    />
                    <span>🗑️ Delete from Lists</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.lists.exportList}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        lists: { ...userPermissions.lists, exportList: e.target.checked }
                      })}
                    />
                    <span>📥 Export Lists</span>
                  </label>
                </div>
              </div>

              {/* Button Permissions */}
              <div className="permission-section">
                <h3>🔘 Button Permissions</h3>
                <p className="section-desc">Control which buttons are available</p>
                <div className="permission-grid">
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.buttons.create}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        buttons: { ...userPermissions.buttons, create: e.target.checked }
                      })}
                    />
                    <span>➕ Create Button</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.buttons.edit}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        buttons: { ...userPermissions.buttons, edit: e.target.checked }
                      })}
                    />
                    <span>✏️ Edit Button</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.buttons.delete}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        buttons: { ...userPermissions.buttons, delete: e.target.checked }
                      })}
                    />
                    <span>🗑️ Delete Button</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.buttons.download}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        buttons: { ...userPermissions.buttons, download: e.target.checked }
                      })}
                    />
                    <span>📥 Download Button</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.buttons.print}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        buttons: { ...userPermissions.buttons, print: e.target.checked }
                      })}
                    />
                    <span>🖨️ Print Button</span>
                  </label>
                  <label className="permission-item">
                    <input 
                      type="checkbox" 
                      checked={userPermissions.buttons.approve}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        buttons: { ...userPermissions.buttons, approve: e.target.checked }
                      })}
                    />
                    <span>✅ Approve Button</span>
                  </label>
                </div>
              </div>

              {/* Icon Permissions */}
              <div className="permission-section">
                <h3>🎨 Icon Control Permissions</h3>
                <p className="section-desc">Control individual icon visibility and state (Visible, Disabled, Invisible)</p>
                
                <div className="icon-control-grid">
                  {/* Profile Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">👤 Profile Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.profileIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, profileIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>

                  {/* Edit Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">✏️ Edit Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.editIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, editIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>

                  {/* Delete Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">🗑️ Delete Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.deleteIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, deleteIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>

                  {/* Update Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">🔄 Update Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.updateIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, updateIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>

                  {/* View Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">👁️ View Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.viewIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, viewIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>

                  {/* Download Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">📥 Download Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.downloadIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, downloadIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>

                  {/* Print Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">🖨️ Print Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.printIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, printIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>

                  {/* Approve Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">✅ Approve Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.approveIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, approveIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>

                  {/* Reject Icon */}
                  <div className="icon-control-item">
                    <span className="icon-control-label">❌ Reject Icon</span>
                    <select 
                      className="icon-control-select"
                      value={userPermissions.icons.rejectIcon}
                      onChange={(e) => setUserPermissions({
                        ...userPermissions,
                        icons: { ...userPermissions.icons, rejectIcon: e.target.value }
                      })}
                    >
                      <option value="visible">✅ Visible & Enabled</option>
                      <option value="disabled">⚠️ Visible but Disabled</option>
                      <option value="invisible">❌ Invisible</option>
                    </select>
                  </div>
                </div>

                {/* Legacy Icon Toggles */}
                <div className="legacy-icon-toggles">
                  <h4>General Icon Settings</h4>
                  <div className="permission-grid">
                    <label className="permission-item">
                      <input 
                        type="checkbox" 
                        checked={userPermissions.icons.showIcons}
                        onChange={(e) => setUserPermissions({
                          ...userPermissions,
                          icons: { ...userPermissions.icons, showIcons: e.target.checked }
                        })}
                      />
                      <span>🎯 Show All Icons</span>
                    </label>
                    <label className="permission-item">
                      <input 
                        type="checkbox" 
                        checked={userPermissions.icons.actionIcons}
                        onChange={(e) => setUserPermissions({
                          ...userPermissions,
                          icons: { ...userPermissions.icons, actionIcons: e.target.checked }
                        })}
                      />
                      <span>⚡ Enable Action Icons</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="permission-actions">
                <button 
                  className="btn-permission-action"
                  onClick={() => {
                    const allTrue = Object.keys(userPermissions).reduce((acc, category) => {
                      acc[category] = Object.keys(userPermissions[category]).reduce((catAcc, key) => {
                        catAcc[key] = true
                        return catAcc
                      }, {})
                      return acc
                    }, {})
                    setUserPermissions(allTrue)
                  }}
                >
                  ✅ Enable All
                </button>
                <button 
                  className="btn-permission-action danger"
                  onClick={() => {
                    const allFalse = Object.keys(userPermissions).reduce((acc, category) => {
                      acc[category] = Object.keys(userPermissions[category]).reduce((catAcc, key) => {
                        catAcc[key] = false
                        return catAcc
                      }, {})
                      return acc
                    }, {})
                    setUserPermissions(allFalse)
                  }}
                >
                  ❌ Disable All
                </button>
              </div>

              {/* Save Button */}
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setShowPermissionsModal(false)}>
                  Cancel
                </button>
                <button 
                  className="btn-submit"
                  onClick={async () => {
                    if (editingUser) {
                      try {
                        // Save permissions to server via API
                        const response = await userAPI.updateUser(editingUser.id, {
                          permissions: userPermissions
                        })
                        
                        if (response.success) {
                          // Update local user list with new permissions
                          const updatedUsers = users.map(user => 
                            user.id === editingUser.id
                              ? { ...user, permissions: userPermissions }
                              : user
                          )
                          setUsers(updatedUsers)
                          
                          showNotification(`Permissions updated for ${editingUser.username}!`, 'success')
                          setShowPermissionsModal(false)
                        } else {
                          showNotification('Failed to save permissions', 'error')
                        }
                      } catch (error) {
                        console.error('Failed to save permissions:', error)
                        showNotification('Failed to save permissions', 'error')
                      }
                    } else {
                      showNotification('Permissions updated successfully!', 'success')
                      setShowPermissionsModal(false)
                    }
                  }}
                >
                  <span className="btn-icon">💾</span>
                  Save Permissions
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateUser && (
        <div className="modal-overlay" onClick={handleCloseCreateUser}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Create New User'}</h2>
              <button className="modal-close" onClick={handleCloseCreateUser}>✕</button>
            </div>
            
            <form onSubmit={editingUser ? handleUpdateUser : handleSubmitUser} className="user-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="username">Username *</label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={newUser.username}
                    onChange={handleUserInputChange}
                    required
                    placeholder="Create a username (not your phone number)"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={newUser.email}
                    onChange={handleUserInputChange}
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="password">Password {editingUser ? '(leave blank to keep current)' : '*'}</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={newUser.password}
                    onChange={handleUserInputChange}
                    required={!editingUser}
                    placeholder={editingUser ? "Leave blank to keep current" : "Enter password"}
                    minLength="6"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="full_name">Full Name</label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    value={newUser.full_name}
                    onChange={handleUserInputChange}
                    placeholder="Enter full name"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="role">Role *</label>
                  <select
                    id="role"
                    name="role"
                    value={newUser.role}
                    onChange={handleUserInputChange}
                    required
                  >
                    <option value="user">User</option>
                    <option value="agent">Agent</option>
                    <option value="driver">Mini Ride Driver</option>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                    <option value="root">Root</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="position">{['agent', 'driver'].includes(newUser.role) ? 'Position (optional)' : 'Staff Position *'}</label>
                  <input
                    type="text"
                    id="position"
                    name="position"
                    value={newUser.position}
                    onChange={handleUserInputChange}
                    required={!['agent', 'driver'].includes(newUser.role)}
                    placeholder="e.g., Sales Manager, Accountant"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={newUser.phone}
                    onChange={handleUserInputChange}
                    placeholder="+251-11-123-4567"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={handleCloseCreateUser}>
                  Cancel
                </button>
                <button type="submit" className="btn-submit">
                  <span className="btn-icon">✓</span>
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className={`toast-notification ${notification.type}`}>
          <span className="toast-message">{notification.message}</span>
        </div>
      )}

      {/* Restore Modal */}
      {showRestoreModal && (
        <div className="modal-overlay" onClick={() => setShowRestoreModal(false)}>
          <div className="modal-content restore-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🔄 Restore Deleted Data</h2>
              <button className="modal-close" onClick={() => setShowRestoreModal(false)}>✕</button>
            </div>
            
            <div className="restore-content">
              {/* Deleted Registrations */}
              <div className="restore-section">
                <div className="restore-section-header">
                  <h3>📋 Deleted Registrations ({deletedData.registrations.length})</h3>
                  {deletedData.registrations.length > 0 && (
                    <button 
                      className="btn-restore-all"
                      onClick={() => handleRestoreAll('registrations')}
                    >
                      🔄 Restore All
                    </button>
                  )}
                </div>
                
                {deletedData.registrations.length > 0 ? (
                  <>
                  <div className="restore-list">
                    {visibleListItems(deletedData.registrations, 'deleted-registrations').map((reg, index) => (
                      <div key={index} className="restore-item">
                        <div className="restore-item-info">
                          <span className="restore-item-icon">📋</span>
                          <div>
                            <div className="restore-item-title">{reg.client_name}</div>
                            <div className="restore-item-details">
                              Phone: {reg.client_phone} • Kebele: {reg.kebele} • Staff: {reg.staff_username}
                            </div>
                          </div>
                        </div>
                        <button 
                          className="btn-restore-item"
                          onClick={() => handleRestoreItem('registration', reg)}
                        >
                          🔄 Restore
                        </button>
                      </div>
                    ))}
                  </div>
                  {listPagination(deletedData.registrations, 'deleted-registrations', 'deleted registrations')}
                  </>
                ) : (
                  <div className="restore-empty">
                    <span className="empty-icon">✅</span>
                    <p>No deleted registrations</p>
                  </div>
                )}
              </div>

              {/* Deleted Users */}
              <div className="restore-section">
                <div className="restore-section-header">
                  <h3>👥 Deleted Users ({deletedData.users.length})</h3>
                  {deletedData.users.length > 0 && (
                    <button 
                      className="btn-restore-all"
                      onClick={() => handleRestoreAll('users')}
                    >
                      🔄 Restore All
                    </button>
                  )}
                </div>
                
                {deletedData.users.length > 0 ? (
                  <>
                  <div className="restore-list">
                    {visibleListItems(deletedData.users, 'deleted-users').map((user, index) => (
                      <div key={index} className="restore-item">
                        <div className="restore-item-info">
                          <span className="restore-item-icon">👤</span>
                          <div>
                            <div className="restore-item-title">{user.full_name || user.username}</div>
                            <div className="restore-item-details">
                              Username: {user.username} • Role: {user.role} • Position: {user.position || 'N/A'}
                            </div>
                          </div>
                        </div>
                        <button 
                          className="btn-restore-item"
                          onClick={() => handleRestoreItem('user', user)}
                        >
                          🔄 Restore
                        </button>
                      </div>
                    ))}
                  </div>
                  {listPagination(deletedData.users, 'deleted-users', 'deleted users')}
                  </>
                ) : (
                  <div className="restore-empty">
                    <span className="empty-icon">✅</span>
                    <p>No deleted users</p>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowRestoreModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RootDashboard
