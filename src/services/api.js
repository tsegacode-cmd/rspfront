// API Configuration
import { getLiveChatToken } from '../utils/liveChatIdentity'
import { getGuestSession, isGuestMode } from '../utils/guestAccount'

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '');
  }
  if (window.location.protocol === 'https:') {
    return '/api/v1';
  }
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '5000';
  return `http://${window.location.hostname}:${backendPort}/api/v1`;
};

const API_BASE_URL = getApiBaseUrl();
const getSessionApiBaseUrl = preferredBaseUrl =>
  (preferredBaseUrl || API_BASE_URL).replace(/\/health\/?$/, '').replace(/\/+$/, '');
const isLocalFrontend = () =>
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname) ||
  window.location.hostname.endsWith('.localhost');
export const isApiBackendConfigured = () =>
  Boolean(import.meta.env.VITE_BACKEND_CONFIGURED) || isLocalFrontend();

const getLiveChatAuthorizationHeader = () => {
  const token = getLiveChatToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getLiveChatAttachmentBlob = async (conversationId, messageId, deviceId, admin = false) => {
  const route = admin
    ? `/live-chat/admin/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(messageId)}`
    : `/live-chat/conversations/${encodeURIComponent(conversationId)}/attachments/${encodeURIComponent(messageId)}?deviceId=${encodeURIComponent(deviceId)}`;
  let lastError;

  for (const url of getUrlsToTry(route)) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: getLiveChatAuthorizationHeader(),
      }, 30000);
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const data = await response.json();
          message = data.message || message;
        } catch {
          // Keep the HTTP status when the server response is not JSON.
        }
        const requestError = new Error(message);
        requestError.status = response.status;
        throw requestError;
      }
      return await response.blob();
    } catch (error) {
      if (error.status) throw error;
      lastError = error;
    }
  }

  throw lastError;
};

// Try the page host first so authentication reaches the same backend as the health check.
const getUrlsToTry = (endpoint, preferredBaseUrl) => {
  if (!isApiBackendConfigured()) {
    throw new Error('The frontend is deployed, but the backend is not configured. Set VITE_API_URL to your public HTTPS backend URL ending in /api/v1 in Vercel, then redeploy.');
  }

  if (import.meta.env.PROD && !isLocalFrontend()) {
    return [
      ...(preferredBaseUrl ? [`${preferredBaseUrl.replace(/\/+$/, '')}${endpoint}`] : []),
      `${API_BASE_URL}${endpoint}`,
    ].filter((url, idx, arr) => arr.indexOf(url) === idx);
  }

  const networkIP = import.meta.env.VITE_NETWORK_IP || '192.168.98.195';
  const backendPort = import.meta.env.VITE_BACKEND_PORT || '5000';
  const hostname = window.location.hostname;
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const rootApiBaseUrl = localStorage.getItem('rootToken')
    ? localStorage.getItem('rootApiBaseUrl')
    : '';
  const authToken = localStorage.getItem('authToken');
  const userApiBaseUrl = !localStorage.getItem('rootToken') && authToken && !authToken.startsWith('guest-')
    ? localStorage.getItem('authApiBaseUrl')
    : '';
  return [
    ...(preferredBaseUrl ? [`${preferredBaseUrl}${endpoint}`] : []),
    ...(rootApiBaseUrl ? [`${rootApiBaseUrl.replace(/\/+$/, '')}${endpoint}`] : []),
    ...(userApiBaseUrl ? [`${userApiBaseUrl.replace(/\/+$/, '')}${endpoint}`] : []),
    `${protocol}//${hostname}:${backendPort}/api/v1${endpoint}`,
    `${API_BASE_URL}${endpoint}`,
    `${protocol}//localhost:${backendPort}/api/v1${endpoint}`,
    `${protocol}//127.0.0.1:${backendPort}/api/v1${endpoint}`,
    `${protocol}//${networkIP}:${backendPort}/api/v1${endpoint}`,
  ].filter((url, idx, arr) => (
    (window.location.protocol !== 'https:' || !/^http:\/\//i.test(url)) &&
    arr.indexOf(url) === idx
  )); // deduplicate and avoid mixed-content API requests on HTTPS pages
};

export const getApiHealthUrls = () =>
  isApiBackendConfigured() ? getUrlsToTry('/health') : [];

// Fetch with a hard 8-second timeout — aborts instead of hanging indefinitely
const fetchWithTimeout = (url, config, ms = 8000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...config, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
};

// Get auth token from localStorage
const getAuthToken = () => {
  const authToken = localStorage.getItem('authToken')
  if (authToken?.startsWith('guest-')) return null

  // Try rootToken first (for root dashboard), then fall back to authToken
  return localStorage.getItem('rootToken') || authToken;
};

// API request helper (authenticated)
const apiRequest = async (endpoint, options = {}, timeoutMs = 8000) => {
  const token = getAuthToken();
  
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
    ...options,
  };

  config.headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const urls = getUrlsToTry(endpoint);
  let lastError;

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, config, timeoutMs);
      let data;
      try {
        data = await response.json();
      } catch {
        const parseError = new Error(`The server returned an invalid response for ${endpoint}.`);
        parseError.responseReceived = true;
        throw parseError;
      }
      if (!response.ok) {
        const requestError = new Error(data.message || `HTTP ${response.status}`);
        requestError.status = response.status;
        throw requestError;
      }
      return data;
    } catch (err) {
      if (err.status || err.responseReceived) throw err;
      lastError = err;
      continue;
    }
  }

  throw lastError;
};
// Unauthenticated API request helper
const unauthenticatedRequest = async (endpoint, options = {}, preferredBaseUrl, timeoutMs = 8000) => {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  config.headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const urls = getUrlsToTry(endpoint, preferredBaseUrl);
  let lastError;

  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, config, timeoutMs);
      let data;
      try {
        data = await response.json();
      } catch {
        const parseError = new Error(`The server returned an invalid response for ${endpoint}.`);
        parseError.responseReceived = true;
        throw parseError;
      }
      if (!response.ok) {
        const requestError = new Error(data.message || 'API request failed');
        requestError.status = response.status;
        throw requestError;
      }
      return data;
    } catch (err) {
      if (err.status || err.responseReceived) throw err;
      lastError = err;
      continue;
    }
  }

  throw lastError;
};

const storeOtpSession = (response, preferredBaseUrl) => {
  const { token, user } = response.data || {};
  if (!token || !user) return;

  const isRoot = user.isRoot || ['root', 'admin'].includes(String(user.role || '').toLowerCase());
  if (isRoot) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('authApiBaseUrl');
    localStorage.removeItem('currentUserPermissions');
    localStorage.setItem('rootToken', token);
    localStorage.setItem('rootUser', JSON.stringify(user));
    localStorage.setItem('rootApiBaseUrl', preferredBaseUrl || `http://${window.location.hostname}:${import.meta.env.VITE_BACKEND_PORT || '5000'}/api/v1`);
    return;
  }

  localStorage.removeItem('rootToken');
  localStorage.removeItem('rootUser');
  localStorage.removeItem('rootApiBaseUrl');
  localStorage.setItem('authApiBaseUrl', getSessionApiBaseUrl(preferredBaseUrl));
  localStorage.removeItem('currentUserPermissions');
  localStorage.setItem('authToken', token);
  localStorage.setItem('userData', JSON.stringify(user));
  localStorage.setItem('userProfile', JSON.stringify({
    username: user.username,
    email: user.email || `${user.username}@redsea.com`,
    fullName: user.full_name || user.username,
    phone: user.phone || '',
    position: user.position || '',
    profilePicture: null,
  }));
  if (user.permissions) {
    localStorage.setItem('currentUserPermissions', JSON.stringify(user.permissions));
  }
};

// Auth API
export const authAPI = {
  // Regular user login
  login: async (identifier, password, preferredBaseUrl) => {
    try {
      console.log('=== API LOGIN ATTEMPT ===');
      console.log('Identifier:', identifier);
      
      // Call backend API for authentication
      const response = await unauthenticatedRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ 
          identifier: identifier.trim(), 
          password
        }),
      }, preferredBaseUrl);
      
      if (response.success) {
        console.log('✅ Login successful via API');
        
        // Store token and user data
        const token = response.data.token;
        const user = response.data.user;
        
        localStorage.removeItem('rootToken');
        localStorage.removeItem('rootUser');
        localStorage.removeItem('rootApiBaseUrl');
        localStorage.removeItem('currentUserPermissions');
        localStorage.setItem('authApiBaseUrl', getSessionApiBaseUrl(preferredBaseUrl));
        localStorage.setItem('authToken', token);
        localStorage.setItem('userData', JSON.stringify(user));
        
        // Store permissions for current session
        if (user.permissions) {
          localStorage.setItem('currentUserPermissions', JSON.stringify(user.permissions));
          console.log('✅ User permissions loaded from server:', user.permissions);
        }
        
        return {
          success: true,
          token: token,
          user: user,
          message: response.message || 'Login successful'
        };
      } else {
        console.log('❌ Login failed:', response.message);
        return {
          success: false,
          message: response.message || 'Login failed'
        };
      }
      
    } catch (error) {
      console.error('❌ Login error:', error);
      return {
        success: false,
        message: error.message || 'Login failed. Please try again.'
      };
    }
  },

  telegramMiniAppLogin: async (initData, preferredBaseUrl) => {
    const response = await unauthenticatedRequest('/auth/telegram/miniapp/login', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    }, preferredBaseUrl);
    const { token, user } = response.data || {};
    if (!token || !user) {
      throw new Error('Telegram Mini App login returned an invalid session.');
    }

    localStorage.removeItem('rootToken');
    localStorage.removeItem('rootUser');
    localStorage.removeItem('rootApiBaseUrl');
    localStorage.removeItem('currentUserPermissions');
    localStorage.setItem('authApiBaseUrl', getSessionApiBaseUrl(preferredBaseUrl));
    localStorage.setItem('authToken', token);
    localStorage.setItem('userData', JSON.stringify(user));
    localStorage.setItem('userProfile', JSON.stringify({
      username: user.username,
      email: user.email || `${user.username}@redsea.com`,
      fullName: user.full_name || user.username,
      phone: user.phone || '',
      position: user.position || '',
      profilePicture: null,
    }));
    if (user.permissions) {
      localStorage.setItem('currentUserPermissions', JSON.stringify(user.permissions));
    }
    return response;
  },

  prepareTelegramMiniAppRegistration: (initData, phone, preferredBaseUrl) =>
    unauthenticatedRequest('/auth/telegram/miniapp/register', {
      method: 'POST',
      body: JSON.stringify({ initData, phone }),
    }, preferredBaseUrl),

  getTelegramRegistrationPhone: initData =>
    unauthenticatedRequest('/auth/telegram/miniapp/registration-phone', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    }),

  telegramWidgetLogin: async (telegramUser, isRoot, preferredBaseUrl) => {
    const response = await unauthenticatedRequest('/auth/telegram/widget/login', {
      method: 'POST',
      body: JSON.stringify({ telegramUser, isRoot }),
    }, preferredBaseUrl);
    storeOtpSession(response, preferredBaseUrl);
    return response;
  },

  getOtpConfig: async preferredBaseUrl => unauthenticatedRequest('/auth/otp/config', {}, preferredBaseUrl),
  createGuestUpgradeRequest: async request => unauthenticatedRequest('/auth/otp/upgrade-requests', {
    method: 'POST',
    body: JSON.stringify(request),
  }),
  getGuestUpgradeStatus: async (requestId, accessKey) =>
    unauthenticatedRequest(`/auth/otp/upgrade-requests/${encodeURIComponent(requestId)}?accessKey=${encodeURIComponent(accessKey)}`),
  createRegistrationApprovalRequest: async request => unauthenticatedRequest('/auth/otp/registration-requests', {
    method: 'POST',
    body: JSON.stringify(request),
  }),
  getRegistrationApprovalStatus: async (requestId, accessKey) =>
    unauthenticatedRequest(`/auth/otp/registration-requests/${encodeURIComponent(requestId)}?accessKey=${encodeURIComponent(accessKey)}`),
  verifyRegistrationApprovalOtp: async (requestId, accessKey, code) =>
    unauthenticatedRequest(`/auth/otp/registration-requests/${encodeURIComponent(requestId)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ accessKey, code }),
    }),
  createPasswordResetApprovalRequest: request =>
    unauthenticatedRequest('/auth/otp/password-reset-requests', {
      method: 'POST',
      body: JSON.stringify(request),
    }),
  getPasswordResetApprovalStatus: (requestId, accessKey) =>
    unauthenticatedRequest(`/auth/otp/password-reset-requests/${encodeURIComponent(requestId)}?accessKey=${encodeURIComponent(accessKey)}`),
  verifyPasswordResetApprovalOtp: (requestId, accessKey, code) =>
    unauthenticatedRequest(`/auth/otp/password-reset-requests/${encodeURIComponent(requestId)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ accessKey, code }),
    }),
  resetPasswordWithTelegramMiniApp: (initData, newPassword, preferredBaseUrl) =>
    unauthenticatedRequest('/auth/telegram/miniapp/password-reset', {
      method: 'POST',
      body: JSON.stringify({ initData, newPassword }),
    }, preferredBaseUrl),
  verifyGuestUpgradeOtp: async (requestId, accessKey, code) => {
    const response = await unauthenticatedRequest(`/auth/otp/upgrade-requests/${encodeURIComponent(requestId)}/verify`, {
      method: 'POST',
      body: JSON.stringify({ accessKey, code }),
    });
    storeOtpSession(response);
    return response;
  },

  sendOtp: async ({ phone, email, purpose, channel, telegramChatId, telegramUser, fullName, password }, preferredBaseUrl) => {
    return await unauthenticatedRequest('/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify({ phone, email, purpose, channel, telegramChatId, telegramUser, fullName, password }),
    }, preferredBaseUrl);
  },

  getTelegramLinkStatus: async () => apiRequest('/auth/telegram/link'),

  startTelegramLink: async chatId => apiRequest('/auth/telegram/link', {
    method: 'POST',
    body: JSON.stringify({ chatId }),
  }),

  verifyTelegramLink: async (challengeId, code) => apiRequest('/auth/telegram/link/verify', {
    method: 'POST',
    body: JSON.stringify({ challengeId, code }),
  }),

  verifyOtp: async ({ challengeId, code, newPassword }, preferredBaseUrl) => {
    const response = await unauthenticatedRequest('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code, newPassword }),
    }, preferredBaseUrl);
    storeOtpSession(response, preferredBaseUrl);
    return response;
  },

  verifyFirebaseOtp: async ({ challengeId, idToken, newPassword }, preferredBaseUrl) => {
    const response = await unauthenticatedRequest('/auth/otp/firebase/verify', {
      method: 'POST',
      body: JSON.stringify({ challengeId, idToken, newPassword }),
    }, preferredBaseUrl);
    storeOtpSession(response, preferredBaseUrl);
    return response;
  },

  // User registration
  register: async (userData) => {
    try {
      const data = await apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      });
      
      return {
        success: true,
        token: data.data?.token || data.token,
        user: data.data?.user || data.user,
        message: data.message || 'Registration successful'
      };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        message: error.message || 'Registration failed'
      };
    }
  },

  // Root login
  rootLogin: async (username, password, preferredBaseUrl) => {
    try {
      console.log('=== ROOT LOGIN ATTEMPT ===');
      console.log('Username:', username);
      console.log('API URL:', API_BASE_URL);
      
      const data = await unauthenticatedRequest('/auth/root/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }, preferredBaseUrl);
      
      // Store token
      if (data.success && data.data && data.data.token) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('userData');
        localStorage.removeItem('authApiBaseUrl');
        localStorage.removeItem('currentUserPermissions');
        localStorage.setItem('rootToken', data.data.token);
        localStorage.setItem('rootUser', JSON.stringify(data.data.user));
        localStorage.setItem('rootApiBaseUrl', preferredBaseUrl || `http://${window.location.hostname}:${import.meta.env.VITE_BACKEND_PORT || '5000'}/api/v1`);
        console.log('✅ Root login successful, token stored');
      }
      
      return data;
    } catch (error) {
      console.error('❌ Root login error:', error);
      return {
        success: false,
        message: error.message || 'Root login failed'
      };
    }
  },

  // Verify root token
  verifyRoot: async () => {
    return await apiRequest('/auth/root/verify');
  },

  // Logout
  logout: () => {
    localStorage.removeItem('rootToken');
    localStorage.removeItem('rootUser');
    localStorage.removeItem('rootApiBaseUrl');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('authApiBaseUrl');
  },

  // Check if logged in
  isAuthenticated: () => {
    return !!getAuthToken();
  },

  // Get stored user
  getUser: () => {
    const user = localStorage.getItem('rootUser');
    return user ? JSON.parse(user) : null;
  },

  // Get current user data (for permission refresh)
  getCurrentUser: async () => {
    return await apiRequest('/auth/me');
  }
};

// Root Dashboard API
export const siteContentAPI = {
  get: async () => unauthenticatedRequest('/root/site-content'),
};

export const rootAPI = {
  // Get health status
  getHealth: async () => {
    try {
      return await apiRequest('/root/health');
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        success: false,
        error: error.message,
        data: {
          server: { status: 'unknown' },
          database: {
            sqlite: { connected: false, error: error.message },
            mongodb: { connected: false, error: error.message },
            mysql: { connected: false, error: error.message }
          }
        }
      };
    }
  },

  // Auto-fix database connection
  autoFix: async () => {
    return await apiRequest('/root/auto-fix', {
      method: 'POST',
    });
  },

  // Get dashboard statistics
  getStats: async () => {
    return await apiRequest('/root/stats');
  },
  getDashboardStatus: async () => apiRequest('/root/dashboard-status'),
  getMiniRides: async () => apiRequest('/root/mini-rides'),
  getDriverApplications: async () => apiRequest('/root/driver-applications'),
  reviewDriverApplication: async (applicationId, status, note = '') => apiRequest(`/root/driver-applications/${encodeURIComponent(applicationId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  }),
  saveMiniRideSettings: async settings => apiRequest('/root/mini-rides/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
  adjustMiniRideDriverWallet: async (driverId, adjustment) => apiRequest(`/root/mini-rides/drivers/${encodeURIComponent(driverId)}/wallet-adjustments`, {
    method: 'POST',
    body: JSON.stringify(adjustment),
  }),
  assignMiniRideDriver: async (rideId, driverId) => apiRequest(`/root/mini-rides/${encodeURIComponent(rideId)}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ driverId }),
  }),
  finishMiniRide: async rideId => apiRequest(`/root/mini-rides/${encodeURIComponent(rideId)}/finish`, { method: 'POST' }),
  reviewMiniRidePayment: async (rideId, status) => apiRequest(`/root/mini-rides/${encodeURIComponent(rideId)}/payment`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),

  // Get recent activity
  getActivity: async () => {
    return await apiRequest('/root/activity');
  },

  // Get all users
  getUsers: async () => {
    return await apiRequest('/root/users');
  },

  // Get all partners
  getPartners: async () => {
    return await apiRequest('/root/partners');
  },

  // Get all transactions
  getTransactions: async () => {
    return await apiRequest('/root/transactions');
  },

  // Get system logs
  getLogs: async () => {
    return await apiRequest('/root/logs');
  },
  getOtpSettings: async () => apiRequest('/root/otp-settings'),
  saveSiteContent: async content => apiRequest('/root/site-content', {
    method: 'PUT',
    body: JSON.stringify(content),
  }),
  saveOtpSettings: async settings => apiRequest('/root/otp-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
  testTelegramOtpSettings: async () => apiRequest('/root/otp-settings/test-telegram', {
    method: 'POST',
  }),
  configureTelegramContactWebhook: async () => apiRequest('/root/otp-settings/configure-telegram-webhook', {
    method: 'POST',
  }),
  getGuestUpgradeRequests: async () => apiRequest('/root/otp/upgrade-requests'),
  approveGuestUpgradeRequest: async requestId => apiRequest(`/root/otp/upgrade-requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'POST',
  }),
  getWalletManagement: async () => apiRequest('/root/wallet-management'),
  getUserActivity: async (page = 1) => apiRequest(`/root/user-activity?page=${encodeURIComponent(page)}`),
  getCoinLevelRules: async () => apiRequest('/root/coin-level-rules'),
  saveCoinLevelRules: async rules => apiRequest('/root/coin-level-rules', {
    method: 'PUT',
    body: JSON.stringify({ rules }),
  }),
  getCoinLevelHistory: async () => apiRequest('/root/coin-level-history'),
  getWalletActivity: async filters => {
    const query = new URLSearchParams(filters).toString()
    return apiRequest(`/root/wallet-management/activity?${query}`)
  },
  updateWalletSettings: async settings => apiRequest('/root/wallet-management/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
  adjustWalletBalance: async adjustment => apiRequest('/root/wallet-management/adjustments', {
    method: 'POST',
    body: JSON.stringify(adjustment),
  }),
  updateWithdrawal: async (withdrawalId, status) => apiRequest(`/root/wallet-management/withdrawals/${encodeURIComponent(withdrawalId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  getWithdrawalReceipt: async withdrawalId => apiRequest(`/root/wallet-management/withdrawals/${encodeURIComponent(withdrawalId)}/receipt`),
  updateDeposit: async (depositId, status) => apiRequest(`/root/wallet-management/deposits/${encodeURIComponent(depositId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  getUtilityPayments: async () => apiRequest('/root/utility-payments'),
  updateUtilityPayment: async (requestId, changes) => apiRequest(`/root/utility-payments/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }),
  getServiceProducts: async () => apiRequest('/root/marketplace/products'),
  getMarketplaceSettings: async () => apiRequest('/root/marketplace/settings'),
  saveMarketplaceSettings: async settings => apiRequest('/root/marketplace/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
  saveServiceProduct: async (serviceKey, product) => apiRequest('/root/marketplace/products', {
    method: 'POST',
    body: JSON.stringify({ serviceKey, product }),
  }),
  updateServiceProduct: async (productId, changes) => apiRequest(`/root/marketplace/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }),
  deleteServiceProduct: async productId => apiRequest(`/root/marketplace/products/${encodeURIComponent(productId)}`, {
    method: 'DELETE',
  }),
  getPromotions: async () => apiRequest('/root/promotions'),
  getPromoCodes: async () => apiRequest('/root/promo-codes'),
  createPromoCode: async promoCode => apiRequest('/root/promo-codes', {
    method: 'POST',
    body: JSON.stringify(promoCode),
  }),
  createPromoCodeBatch: async batch => apiRequest('/root/promo-codes/batch', {
    method: 'POST',
    body: JSON.stringify(batch),
  }),
  createPromotion: async promotion => apiRequest('/root/promotions', {
    method: 'POST',
    body: JSON.stringify(promotion),
  }),
  updatePromotion: async (promotionId, changes) => apiRequest(`/root/promotions/${encodeURIComponent(promotionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }),
  deletePromotion: async promotionId => apiRequest(`/root/promotions/${encodeURIComponent(promotionId)}`, {
    method: 'DELETE',
  }),
  getBoostRequests: async () => apiRequest('/root/boost-requests'),
  updateBoostRequest: async (requestId, status) => apiRequest(`/root/boost-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  getLinkCampaigns: async () => apiRequest('/root/link-campaigns'),
  getLinkCampaignSettings: async () => apiRequest('/root/link-campaign-settings'),
  saveLinkCampaignSettings: async settings => apiRequest('/root/link-campaign-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
  getDailyGameRewardSettings: async () => apiRequest('/root/daily-game-reward-settings'),
  saveDailyGameRewardSettings: async games => apiRequest('/root/daily-game-reward-settings', {
    method: 'PUT',
    body: JSON.stringify({ games }),
  }),
  reviewLinkCampaign: async (campaignId, status) => apiRequest(`/root/link-campaigns/${encodeURIComponent(campaignId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  getAgentManagement: async () => apiRequest('/root/agents'),
  getAgentAnalytics: async (period = 'all', search = '', coinActivityPage = 0, from = '', to = '', role = '', userId = '', userPage = 0) => apiRequest(
    `/root/agents/analytics?period=${encodeURIComponent(period)}&search=${encodeURIComponent(search)}&coinActivityPage=${encodeURIComponent(coinActivityPage)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&role=${encodeURIComponent(role)}&userId=${encodeURIComponent(userId)}&userPage=${encodeURIComponent(userPage)}`
  ),
  getAgentDetails: async agentId => apiRequest(`/root/agents/${encodeURIComponent(agentId)}`),
  getAgentDetailsStatus: async agentId => apiRequest(`/root/agents/${encodeURIComponent(agentId)}/status`),
  updateAgentSettings: async (agentId, settings) => apiRequest(`/root/agents/${encodeURIComponent(agentId)}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
  fundAgentPackagePool: async funding => apiRequest('/root/agents/package-pool', {
    method: 'POST',
    body: JSON.stringify(funding),
  }),
  reviewAgentPackageRequest: async (requestId, status) => apiRequest(`/root/agents/package-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  reviewAgentProduct: async (productId, status) => apiRequest(`/root/agents/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  reviewAgentCatalogProduct: async (productId, status) => apiRequest(`/root/agents/service-products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  getAgentWalletRequestReceipt: async requestId => apiRequest(`/root/agents/wallet-requests/${encodeURIComponent(requestId)}/receipt`, {}, 30000),
  adjustAgentPackageBalance: async (agentId, adjustment) => apiRequest(`/root/agents/${encodeURIComponent(agentId)}/package-adjustments`, {
    method: 'POST',
    body: JSON.stringify(adjustment),
  }),
  adjustAgentWalletBalance: async (agentId, adjustment) => apiRequest(`/root/agents/${encodeURIComponent(agentId)}/wallet-adjustments`, {
    method: 'POST',
    body: JSON.stringify(adjustment),
  })
};

const UTILITY_GUEST_TOKEN_KEY = 'redsea_utility_guest_token'
const utilityGuestSessionRequests = new Map()

const getUtilityGuestTokenKey = () => {
  const guest = getGuestSession()
  const guestId = guest?.id || guest?.phone
  if (!guestId) throw new Error('The current guest account could not be identified.')
  return `${UTILITY_GUEST_TOKEN_KEY}:${encodeURIComponent(String(guestId))}`
}

const getUtilityGuestToken = async tokenKey => {
  const savedToken = localStorage.getItem(tokenKey)
  if (savedToken) return savedToken
  if (!utilityGuestSessionRequests.has(tokenKey)) {
    const sessionRequest = unauthenticatedRequest('/auth/utility-guest-session', {
      method: 'POST',
    }).then(response => {
      const token = response?.data?.token
      if (typeof token !== 'string' || !token) {
        throw new Error('The server did not issue a guest utility session.')
      }
      localStorage.setItem(tokenKey, token)
      return token
    }).finally(() => {
      utilityGuestSessionRequests.delete(tokenKey)
    })
    utilityGuestSessionRequests.set(tokenKey, sessionRequest)
  }
  return utilityGuestSessionRequests.get(tokenKey)
}

const utilityGuestRequest = async (endpoint, options = {}) => {
  const tokenKey = getUtilityGuestTokenKey()
  const sendRequest = token => unauthenticatedRequest(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })

  let token = await getUtilityGuestToken(tokenKey)
  try {
    return await sendRequest(token)
  } catch (error) {
    if (error.status !== 401) throw error
    localStorage.removeItem(tokenKey)
    token = await getUtilityGuestToken(tokenKey)
    return sendRequest(token)
  }
}

export const utilityPaymentAPI = {
  getMine: async () => isGuestMode()
    ? utilityGuestRequest('/auth/utility-payments')
    : apiRequest('/auth/utility-payments'),
  create: async request => {
    const options = {
      method: 'POST',
      body: JSON.stringify(request),
    }
    return isGuestMode()
      ? utilityGuestRequest('/auth/utility-payments', options)
      : apiRequest('/auth/utility-payments', options)
  },
};

export const liveChatAPI = {
  registerClientConversation: async (conversationId, deviceId) =>
    unauthenticatedRequest(`/live-chat/conversations/${encodeURIComponent(conversationId)}/register`, {
      method: 'POST',
      headers: getLiveChatAuthorizationHeader(),
      body: JSON.stringify({ deviceId }),
    }),
  getClientMessages: async (conversationId, deviceId, after = 0) =>
    unauthenticatedRequest(`/live-chat/conversations/${encodeURIComponent(conversationId)}/messages?after=${after}&deviceId=${encodeURIComponent(deviceId)}`, {
      headers: getLiveChatAuthorizationHeader(),
    }),
  sendClientMessage: async (conversationId, deviceId, message) =>
    unauthenticatedRequest(`/live-chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      headers: getLiveChatAuthorizationHeader(),
      body: JSON.stringify({ ...message, deviceId }),
    }, undefined, 30000),
  updateClientMessage: async (conversationId, deviceId, messageId, text) =>
    unauthenticatedRequest(`/live-chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      headers: getLiveChatAuthorizationHeader(),
      body: JSON.stringify({ deviceId, text }),
    }),
  deleteClientMessage: async (conversationId, deviceId, messageId) =>
    unauthenticatedRequest(`/live-chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: getLiveChatAuthorizationHeader(),
      body: JSON.stringify({ deviceId }),
    }),
  forwardClientMessage: async (conversationId, deviceId, messageId) =>
    unauthenticatedRequest(`/live-chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/forward`, {
      method: 'POST',
      headers: getLiveChatAuthorizationHeader(),
      body: JSON.stringify({ deviceId }),
    }),
  getConversations: async () => apiRequest('/live-chat/admin/conversations'),
  sendAdminPresence: async () => apiRequest('/live-chat/admin/presence', { method: 'POST' }),
  sendClientPresence: async () => apiRequest('/live-chat/presence', { method: 'POST' }),
  getSupportPresence: async () => unauthenticatedRequest('/live-chat/support-status'),
  getAdminMessages: async (conversationId, after = 0) =>
    apiRequest(`/live-chat/admin/conversations/${encodeURIComponent(conversationId)}/messages?after=${after}`),
  sendAdminMessage: async (conversationId, message) =>
    apiRequest(`/live-chat/admin/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: 'POST',
      body: JSON.stringify(message),
    }, 30000),
  updateAdminMessage: async (conversationId, messageId, text) =>
    apiRequest(`/live-chat/admin/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),
  deleteAdminMessage: async (conversationId, messageId) =>
    apiRequest(`/live-chat/admin/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    }),
  forwardAdminMessage: async (conversationId, messageId) =>
    apiRequest(`/live-chat/admin/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/forward`, {
      method: 'POST',
    }),
};

const socialRequest = (endpoint, options = {}, timeoutMs = 8000) => {
  const userToken = getLiveChatToken();
  if (!userToken) {
    throw new Error('Sign in with a registered account to use social features.');
  }
  return apiRequest(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${userToken}`,
    },
  }, timeoutMs);
};

const rootSocialRequest = (endpoint, options = {}) => {
  const token = localStorage.getItem('rootToken');
  if (!token) throw new Error('Root authentication is required for user messaging.');
  return apiRequest(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
};

export const socialAPI = {
  getFeed: async () => socialRequest('/social/feed'),
  getRootFeedModeration: async () => rootSocialRequest('/social/admin/feed-moderation'),
  getRootStories: async () => rootSocialRequest('/social/admin/stories'),
  removeRootStory: async (storyId, reason) => rootSocialRequest(
    `/social/admin/stories/${encodeURIComponent(storyId)}`,
    { method: 'DELETE', body: JSON.stringify({ reason }) }
  ),
  moderateRootPost: async (postId, action, reason) => rootSocialRequest(
    `/social/admin/posts/${encodeURIComponent(postId)}/moderation`,
    { method: 'PATCH', body: JSON.stringify({ action, reason }) }
  ),
  reviewRootPostReport: async (reportId, status, reason) => rootSocialRequest(
    `/social/admin/reports/${encodeURIComponent(reportId)}`,
    { method: 'PATCH', body: JSON.stringify({ status, reason }) }
  ),
  reportPost: async (postId, reason, details = '') => socialRequest(
    `/social/posts/${encodeURIComponent(postId)}/reports`,
    { method: 'POST', body: JSON.stringify({ reason, details }) }
  ),
  requestBoost: async request => socialRequest('/social/boost-requests', {
    method: 'POST',
    body: JSON.stringify(request),
  }),
  getMyBoostRequests: async () => socialRequest('/social/boost-requests'),
  getLinkCampaigns: async () => socialRequest('/social/link-campaigns'),
  getDailyGameRewards: async () => socialRequest('/social/daily-game-rewards'),
  playDailyRewardGame: async (gameId, requestId) => socialRequest(
    `/social/daily-game-rewards/${encodeURIComponent(gameId)}/play`,
    { method: 'POST', body: JSON.stringify({ requestId }) },
  ),
  getPromoCodes: async () => socialRequest('/social/promo-codes'),
  claimPromoCode: async code => socialRequest('/social/promo-codes/claim', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }),
  createLinkCampaign: async campaign => socialRequest('/social/link-campaigns', {
    method: 'POST',
    body: JSON.stringify(campaign),
  }, 30000),
  startLinkCampaignView: async campaignId => socialRequest(`/social/link-campaigns/${encodeURIComponent(campaignId)}/views`, {
    method: 'POST',
  }),
  progressLinkCampaignView: async viewId => socialRequest(`/social/link-campaign-views/${encodeURIComponent(viewId)}/progress`, {
    method: 'POST',
  }),
  claimLinkCampaignReward: async viewId => socialRequest(`/social/link-campaign-views/${encodeURIComponent(viewId)}/claim`, {
    method: 'POST',
  }),
  getStories: async () => socialRequest('/social/stories'),
  createStory: async story => socialRequest('/social/stories', { method: 'POST', body: JSON.stringify(story) }),
  likeStory: async storyId => socialRequest(`/social/stories/${encodeURIComponent(storyId)}/like`, { method: 'POST' }),
  getStoryComments: async storyId => socialRequest(`/social/stories/${encodeURIComponent(storyId)}/comments`),
  commentStory: async (storyId, body) => socialRequest(`/social/stories/${encodeURIComponent(storyId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  }),
  shareStory: async storyId => socialRequest(`/social/stories/${encodeURIComponent(storyId)}/share`, { method: 'POST' }),
  createPost: async post => socialRequest('/social/posts', { method: 'POST', body: JSON.stringify(post) }),
  deletePost: async postId => socialRequest(`/social/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' }),
  likePost: async postId => socialRequest(`/social/posts/${encodeURIComponent(postId)}/like`, { method: 'POST' }),
  getPostComments: async postId => socialRequest(`/social/posts/${encodeURIComponent(postId)}/comments`),
  commentPost: async (postId, body) => socialRequest(`/social/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  }),
  sharePost: async postId => socialRequest(`/social/posts/${encodeURIComponent(postId)}/share`, { method: 'POST' }),
  repostPost: async (postId, comment = '') => socialRequest(`/social/posts/${encodeURIComponent(postId)}/repost`, {
    method: 'POST',
    body: JSON.stringify({ comment }),
  }),
  getPeople: async query => socialRequest(`/social/people?q=${encodeURIComponent(query || '')}`),
  getProfile: async userId => socialRequest(`/social/people/${encodeURIComponent(userId)}`),
  getFriends: async () => socialRequest('/social/friends'),
  updatePresence: async () => socialRequest('/social/presence/heartbeat', { method: 'POST' }),
  getRootMessageUsers: async (query, role) => rootSocialRequest(
    `/social/admin/messages/users?q=${encodeURIComponent(query || '')}&role=${encodeURIComponent(role || '')}`
  ),
  getRootUserThreads: async userId => rootSocialRequest(`/social/admin/messages/threads/${encodeURIComponent(userId)}`),
  getRootMessageConversation: async (userId, otherUserId) => rootSocialRequest(
    `/social/admin/messages/conversation?userId=${encodeURIComponent(userId)}&otherUserId=${encodeURIComponent(otherUserId)}`
  ),
  sendRootMessage: async (recipientId, body) => rootSocialRequest('/social/admin/messages', {
    method: 'POST',
    body: JSON.stringify({ recipientId, body }),
  }),
  requestFriend: async userId => socialRequest(`/social/friends/${encodeURIComponent(userId)}/request`, { method: 'POST' }),
  respondFriendRequest: async (requestId, status) => socialRequest(`/social/friends/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  follow: async userId => socialRequest(`/social/follows/${encodeURIComponent(userId)}`, { method: 'POST' }),
  unfollow: async userId => socialRequest(`/social/follows/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  getInbox: async () => socialRequest('/social/messages'),
  getSocialUnreadCounts: async () => socialRequest('/social/unread-counts'),
  getConversation: async (userId, after = '') => socialRequest(
    `/social/messages/conversation?userId=${encodeURIComponent(userId)}${after ? `&after=${encodeURIComponent(after)}` : ''}`
  ),
  sendMessage: async (recipientId, body, type = 'text') => socialRequest('/social/messages', {
    method: 'POST',
    body: JSON.stringify({ recipientId, body, type }),
  }),
  sendConversationMessage: async (recipientId, body, type = 'text', extra = {}) => socialRequest('/social/messages', {
    method: 'POST',
    body: JSON.stringify({ recipientId, body, type, ...extra }),
  }, type === 'image' ? 30000 : 8000),
  updateMessage: async (messageId, body, caption) => socialRequest(`/social/messages/${encodeURIComponent(messageId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ body, caption }),
  }),
  deleteMessage: async messageId => socialRequest(`/social/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),
  forwardMessage: async (messageId, recipientId) => socialRequest(`/social/messages/${encodeURIComponent(messageId)}/forward`, {
    method: 'POST',
    body: JSON.stringify({ recipientId }),
  }),
  getNotifications: async () => socialRequest('/social/notifications'),
  markNotificationsRead: async () => socialRequest('/social/notifications/read', { method: 'POST' }),
  getWallet: async () => socialRequest('/social/wallet'),
  getCoinLevel: async () => socialRequest('/social/wallet/coin-level'),
  getWalletActivity: async filters => {
    const query = new URLSearchParams(filters).toString()
    return socialRequest(`/social/wallet/activity?${query}`)
  },
  deposit: async (amount, paymentMethod, paymentReference) => socialRequest('/social/wallet/deposits', {
    method: 'POST',
    body: JSON.stringify({ amount, paymentMethod, paymentReference }),
  }),
  withdraw: async (amount, payoutDetails, balanceType = 'real', transactionReference = '', receiptFile = '') => socialRequest('/social/wallet/withdrawals', {
    method: 'POST',
    body: JSON.stringify({ amount, payoutDetails, balanceType, transactionReference, receiptFile }),
  }),
  giftCoins: async (recipientUsername, amount) => socialRequest('/social/wallet/coins/gifts', {
    method: 'POST',
    body: JSON.stringify({ recipientUsername, amount }),
  }),
  convertCoinsToEtb: async amount => socialRequest('/social/wallet/coins/convert', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  }),
  buyCoins: async amount => socialRequest('/social/wallet/coins/buy', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  }),
  createCoinSavings: async (amount, durationDays) => socialRequest('/social/wallet/coins/savings', {
    method: 'POST',
    body: JSON.stringify({ amount, durationDays }),
  }),
  convertBonusToReal: async amount => socialRequest('/social/wallet/bonus/convert', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  }),
  getReferralCode: async () => socialRequest('/social/referral-code')
};

export const marketplaceAPI = {
  getProducts: async serviceKey => unauthenticatedRequest(`/marketplace/products${serviceKey ? `?serviceKey=${encodeURIComponent(serviceKey)}` : ''}`),
  getSettings: async () => unauthenticatedRequest('/marketplace/settings'),
  createProduct: async (serviceKey, product) => apiRequest('/marketplace/products', {
    method: 'POST',
    body: JSON.stringify({ serviceKey, product }),
  }),
  getPromotions: async audienceStatus => unauthenticatedRequest(`/marketplace/promotions${audienceStatus ? `?audienceStatus=${encodeURIComponent(audienceStatus)}` : ''}`)
};

export const agentAPI = {
  getDashboard: async () => apiRequest('/agent/dashboard'),
  getDashboardStatus: async () => apiRequest('/agent/dashboard/status'),
  getTeamMemberActivity: async userId => apiRequest(`/agent/team/${encodeURIComponent(userId)}/activity`),
  getActiveAgents: async () => apiRequest('/agent/active'),
  getMyWalletRequests: async () => apiRequest('/agent/wallet-requests/mine'),
  getWalletRequestReceipt: async requestId => apiRequest(`/agent/wallet-requests/${encodeURIComponent(requestId)}/receipt`, {}, 30000),
  createWalletRequest: async request => apiRequest('/agent/wallet-requests', {
    method: 'POST',
    body: JSON.stringify(request),
  }, 30000),
  reviewWalletRequest: async (requestId, status) => apiRequest(`/agent/wallet-requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  createProduct: async product => apiRequest('/agent/products', {
    method: 'POST',
    body: JSON.stringify(product),
  }),
  updateProduct: async (productId, status) => apiRequest(`/agent/products/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  requestPackageFunds: async request => apiRequest('/agent/package-requests', {
    method: 'POST',
    body: JSON.stringify(request),
  }),
  createChildAccount: async account => apiRequest('/agent/children', {
    method: 'POST',
    body: JSON.stringify(account),
  }),
  createCommissionRecord: async record => apiRequest('/agent/commissions', {
    method: 'POST',
    body: JSON.stringify(record),
  }),
};

export const miniRideAPI = {
  getSettings: async () => apiRequest('/mini-ride/settings'),
  getAvailableDrivers: async () => apiRequest('/mini-ride/drivers'),
  getMyRides: async () => apiRequest('/mini-ride/mine'),
  getRide: async rideId => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}`),
  createRide: async ride => apiRequest('/mini-ride/rides', {
    method: 'POST',
    body: JSON.stringify(ride),
  }),
  updateDriverStatus: async status => apiRequest('/mini-ride/driver/status', {
    method: 'PUT',
    body: JSON.stringify(status),
  }),
  getDriverDashboard: async () => apiRequest('/mini-ride/driver/dashboard'),
  getDriverApplicationStatus: async () => apiRequest('/mini-ride/driver/application'),
  submitDriverApplication: async application => apiRequest('/mini-ride/driver/application', {
    method: 'POST',
    body: JSON.stringify(application),
  }),
  acceptRide: async rideId => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}/accept`, { method: 'POST' }),
  startRide: async rideId => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}/start`, { method: 'POST' }),
  finishRide: async rideId => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}/finish`, { method: 'POST' }),
  pauseRide: async rideId => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}/pause`, {
    method: 'POST',
    body: JSON.stringify({ paused: true }),
  }),
  resumeRide: async rideId => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}/pause`, {
    method: 'POST',
    body: JSON.stringify({ paused: false }),
  }),
  updateLocation: async (rideId, location) => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}/location`, {
    method: 'POST',
    body: JSON.stringify(location),
  }),
  payRide: async (rideId, payment) => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}/payment`, {
    method: 'POST',
    body: JSON.stringify(payment),
  }),
  confirmCash: async rideId => apiRequest(`/mini-ride/rides/${encodeURIComponent(rideId)}/cash-confirmation`, { method: 'POST' }),
}

// Local fallback store for service booking requests (used when the backend
// rejects the request — e.g. missing/expired token or offline) so the user
// experience never breaks with a raw "invalid token" error.
const LOCAL_BOOKING_KEY = 'service_booking_requests_local';

const readLocalBookings = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_BOOKING_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLocalBookings = (list) => {
  try {
    localStorage.setItem(LOCAL_BOOKING_KEY, JSON.stringify(list));
  } catch (storageError) {
    console.error('Could not persist local booking request:', storageError);
  }
};

export const serviceBookingAPI = {
  getWalletBookingQuote: async quote => apiRequest('/service-bookings/wallet/quote', {
    method: 'POST',
    body: JSON.stringify(quote),
  }),
  createWalletRequest: async request => apiRequest('/service-bookings/wallet/requests', {
    method: 'POST',
    body: JSON.stringify(request),
  }),
  createRequest: async request => {
    const token = getAuthToken();
    try {
      return await apiRequest('/service-bookings/requests', {
        method: 'POST',
        ...(token && { headers: { Authorization: `Bearer ${token}` } }),
        body: JSON.stringify(request),
      });
    } catch (error) {
      // Graceful fallback: if there is no token, the token is invalid/expired,
      // or the server is unreachable, keep the request locally instead of
      // surfacing a raw "invalid token expired" error on the product card.
      const isAuthOrNetworkError =
        !token ||
        error?.status === 401 ||
        error?.status === 403 ||
        error?.status === 404 ||
        error?.status === 500 ||
        error?.status === 502 ||
        error?.status === 503 ||
        !error?.status; // network / timeout
      if (isAuthOrNetworkError) {
        const stored = { ...request, id: request.requestId, pendingSync: true, savedAt: new Date().toISOString() };
        writeLocalBookings([stored, ...readLocalBookings()]);
        return { success: true, data: stored, offline: true };
      }
      throw error;
    }
  },
  getRequests: async () => {
    try {
      return await apiRequest('/service-bookings/requests');
    } catch {
      return { success: true, data: readLocalBookings() };
    }
  },
  getMyRequests: async () => {
    const token = getAuthToken();
    try {
      return await apiRequest('/service-bookings/requests/mine', {
        ...(token && { headers: { Authorization: `Bearer ${token}` } }),
      });
    } catch {
      return { success: true, data: readLocalBookings() };
    }
  },
  downloadProduct: async requestId => {
    const endpoint = `/service-bookings/requests/${encodeURIComponent(requestId)}/download`;
    const token = getAuthToken();
    let lastError;
    for (const url of getUrlsToTry(endpoint)) {
      try {
        const response = await fetchWithTimeout(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }, 600000);
        if (!response.ok) {
          let message = `Could not download the product (HTTP ${response.status}).`;
          try {
            const data = await response.json();
            message = data.message || message;
          } catch {
            // Keep the HTTP status when the download service returns no JSON error.
          }
          const downloadError = new Error(message);
          downloadError.status = response.status;
          throw downloadError;
        }

        const contentDisposition = response.headers.get('Content-Disposition') || '';
        const encodedFilename = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const plainFilename = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
        let filename = plainFilename || 'digital-product';
        try {
          if (encodedFilename) filename = decodeURIComponent(encodedFilename);
        } catch {
          filename = plainFilename || 'digital-product';
        }
        const blob = await response.blob();
        return { blob, filename, contentType: response.headers.get('Content-Type') || blob.type || 'application/octet-stream' };
      } catch (error) {
        if (error.status) throw error;
        lastError = error;
      }
    }
    throw lastError;
  },
  previewProduct: async requestId => {
    const endpoint = `/service-bookings/requests/${encodeURIComponent(requestId)}/preview`;
    const token = getAuthToken();
    const headers = {};
    if (token) headers.Authorization = ['Bearer', token].join(' ');
    let lastError;
    for (const url of getUrlsToTry(endpoint)) {
      try {
        const response = await fetchWithTimeout(url, { headers }, 600000);
        if (!response.ok) {
          let message = `Could not open the product (HTTP ${response.status}).`;
          try {
            const data = await response.json();
            message = data.message || message;
          } catch {
            // Keep the HTTP status when the file service does not return JSON.
          }
          const previewError = new Error(message);
          previewError.status = response.status;
          throw previewError;
        }
        const contentDisposition = response.headers.get('Content-Disposition') || '';
        const encodedFilename = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const plainFilename = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];
        let filename = plainFilename || 'digital-product';
        if (encodedFilename) filename = decodeURIComponent(encodedFilename);
        const blob = await response.blob();
        return { blob, filename, contentType: response.headers.get('Content-Type') || blob.type || '' };
      } catch (error) {
        if (error.status) throw error;
        lastError = error;
      }
    }
    throw lastError;
  },
  updateRequest: async (requestId, changes) => apiRequest(`/service-bookings/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  }),
  initiateChapaPayment: async payment => apiRequest('/service-bookings/chapa/initialize', {
    method: 'POST',
    body: JSON.stringify(payment),
  }),
  getPaymentProviders: async () => unauthenticatedRequest('/service-bookings/payment-providers'),
  savePaymentProviders: async providers => apiRequest('/service-bookings/payment-providers', {
    method: 'PUT',
    body: JSON.stringify({ providers }),
  }),
};

// User Management API
export const userAPI = {
  // Create user
  createUser: async (userData) => {
    return await apiRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  // Get all users
  getAllUsers: async () => {
    return await apiRequest('/users');
  },

  // Update user
  updateUser: async (userId, userData) => {
    return await apiRequest(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  },

  // Toggle user status
  toggleUserStatus: async (userId) => {
    return await apiRequest(`/users/${userId}/toggle-status`, {
      method: 'PATCH',
    });
  },

  // Delete user
  deleteUser: async (userId) => {
    return await apiRequest(`/users/${userId}`, {
      method: 'DELETE',
    });
  }
};

// Data Registration API
export const dataRegistrationAPI = {
  getProjectTitleSettings: async () => await apiRequest('/data-registrations/settings/project-titles'),
  getProjectDocuments: async () => await apiRequest('/data-registrations/settings/project-documents'),
  getBankReceiptDocument: async registrationId => await apiRequest(`/data-registrations/${registrationId}/bank-receipt`),
  getOwnerReceiptDocument: async registrationId => await apiRequest(`/data-registrations/${registrationId}/owner-receipt`),
  saveProjectDocument: async (title, pdfData) => await apiRequest(`/data-registrations/settings/project-documents/${encodeURIComponent(title)}`, {
    method: 'PUT',
    body: JSON.stringify({ pdf_data: pdfData }),
  }),
  deleteProjectDocument: async title => await apiRequest(`/data-registrations/settings/project-documents/${encodeURIComponent(title)}`, {
    method: 'DELETE',
  }),
  saveProjectTitleSettings: async settings => await apiRequest('/data-registrations/settings/project-titles', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),

  // Create data registration
  createRegistration: async (registrationData) => {
    return await apiRequest('/data-registrations', {
      method: 'POST',
      body: JSON.stringify(registrationData),
    });
  },

  // Get all registrations
  getAllRegistrations: async () => {
    return await apiRequest('/data-registrations', { cache: 'no-store' });
  },

  // Get single registration
  getRegistrationById: async (registrationId) => {
    return await apiRequest(`/data-registrations/${registrationId}`);
  },
  getRegistrationImage: async registrationId => await apiRequest(`/data-registrations/${registrationId}/image`),

  // Update registration
  updateRegistration: async (registrationId, registrationData) => {
    // Aggressively sanitize the ID
    let cleanId = registrationId;
    
    // If it's an object, extract the string value
    if (typeof registrationId === 'object' && registrationId !== null) {
      cleanId = registrationId._id || registrationId.id || registrationId.toString();
    }
    
    // Convert to string and trim
    cleanId = String(cleanId).trim();
    
    console.log('🔧 UPDATE REGISTRATION API CALL');
    console.log('Original ID:', registrationId);
    console.log('Original ID type:', typeof registrationId);
    console.log('Cleaned ID:', cleanId);
    console.log('Cleaned ID type:', typeof cleanId);
    console.log('Cleaned ID length:', cleanId.length);
    
    return await apiRequest(`/data-registrations/${cleanId}`, {
      method: 'PUT',
      body: JSON.stringify(registrationData),
    });
  },

  // Delete registration
  deleteRegistration: async (registrationId) => {
    // Aggressively sanitize the ID
    let cleanId = registrationId;
    
    // If it's an object, extract the string value
    if (typeof registrationId === 'object' && registrationId !== null) {
      cleanId = registrationId._id || registrationId.id || registrationId.toString();
    }
    
    // Convert to string and trim
    cleanId = String(cleanId).trim();
    
    console.log('🗑️ DELETE REGISTRATION API CALL');
    console.log('Original ID:', registrationId);
    console.log('Original ID type:', typeof registrationId);
    console.log('Cleaned ID:', cleanId);
    console.log('Cleaned ID type:', typeof cleanId);
    console.log('Cleaned ID length:', cleanId.length);
    
    return await apiRequest(`/data-registrations/${cleanId}`, {
      method: 'DELETE',
    });
  }
};

export default {
  authAPI,
  rootAPI,
  userAPI,
  dataRegistrationAPI
};
