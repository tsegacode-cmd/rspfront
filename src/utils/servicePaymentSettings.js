import { serviceBookingAPI } from '../services/api'

export const SERVICE_PAYMENT_SETTINGS_KEY = 'service_payment_provider_settings'

export const DEFAULT_SERVICE_PAYMENT_PROVIDERS = [
  {
    id: 'Telebirr',
    name: 'Telebirr',
    accountName: 'Red Sea Property',
    phone: '0968347171',
    accountNumber: '',
    bankName: '',
    logo: '',
    enabled: true,
    serviceEnabled: true,
    utilityEnabled: true,
    ussdTemplate: '*127*{phone}*1*{amount}#',
    accounts: [{ id: 'Telebirr-1', accountName: 'Red Sea Property', phone: '0968347171', accountNumber: '', bankName: '', ussdTemplate: '*127*{phone}*1*{amount}#', enabled: true, walletEnabled: true }],
  },
  {
    id: 'Ebirr',
    name: 'Ebirr',
    accountName: 'Red Sea Property',
    phone: '0968347171',
    accountNumber: '',
    bankName: '',
    logo: '',
    enabled: true,
    serviceEnabled: true,
    utilityEnabled: true,
    ussdTemplate: '*681*{phone}*{amount}#',
    accounts: [{ id: 'Ebirr-1', accountName: 'Red Sea Property', phone: '0968347171', accountNumber: '', bankName: '', ussdTemplate: '*681*{phone}*{amount}#', enabled: true, walletEnabled: true }],
  },
  {
    id: 'CBE Birr',
    name: 'CBE Birr',
    accountName: 'Red Sea Property',
    phone: '0968347171',
    accountNumber: '',
    bankName: '',
    logo: '',
    enabled: true,
    serviceEnabled: true,
    utilityEnabled: true,
    ussdTemplate: '',
    accounts: [{ id: 'CBE Birr-1', accountName: 'Red Sea Property', phone: '0968347171', accountNumber: '', bankName: '', ussdTemplate: '', enabled: true, walletEnabled: true }],
  },
  {
    id: 'Chapa',
    name: 'Chapa (automatic checkout)',
    accountName: 'Chapa',
    phone: '',
    accountNumber: '',
    bankName: '',
    logo: '',
    enabled: false,
    serviceEnabled: true,
    utilityEnabled: false,
    automaticEnabled: false,
    chapaApiKey: '',
    chapaApiKeyConfigured: false,
    chapaReturnUrl: '',
    chapaMethods: { telebirr: true, cbe: true, amole: false, awash: false, mpesa: false },
    ussdTemplate: '',
    accounts: [{ id: 'Chapa-1', accountName: 'Chapa', phone: '', accountNumber: '', bankName: '', ussdTemplate: '', enabled: true, walletEnabled: true }],
  },
  {
    id: 'Bank',
    name: 'Bank',
    accountName: 'Red Sea Property',
    phone: '',
    accountNumber: '',
    bankName: '',
    logo: '',
    enabled: true,
    serviceEnabled: true,
    utilityEnabled: true,
    ussdTemplate: '',
    accounts: [{ id: 'Bank-1', accountName: 'Red Sea Property', phone: '', accountNumber: '', bankName: '', ussdTemplate: '', enabled: true, serviceEnabled: true, utilityEnabled: true, walletEnabled: true }],
  },
]

export const getServicePaymentProviders = async () => {
  const response = await serviceBookingAPI.getPaymentProviders()
  if (!response.success) throw new Error(response.message || 'Could not read payment provider settings.')
  const providers = response.data || DEFAULT_SERVICE_PAYMENT_PROVIDERS
  if (!Array.isArray(providers)) throw new Error('Saved provider settings are not a list.')
  return DEFAULT_SERVICE_PAYMENT_PROVIDERS.map(defaultProvider => {
    const savedProvider = providers.find(provider => provider.id === defaultProvider.id)
    const accounts = savedProvider?.accounts?.length
      ? savedProvider.accounts
      : savedProvider
        ? [{
            id: `${savedProvider.id}-default`,
            accountName: savedProvider.accountName || '',
            phone: savedProvider.phone || '',
            accountNumber: savedProvider.accountNumber || '',
            bankName: savedProvider.bankName || '',
            ussdTemplate: savedProvider.ussdTemplate || '',
            enabled: true,
            walletEnabled: true,
          }]
        : defaultProvider.accounts
    const legacyEnabled = savedProvider?.enabled !== false
    const serviceEnabled = savedProvider?.serviceEnabled ?? legacyEnabled
    const utilityEnabled = savedProvider?.utilityEnabled ?? legacyEnabled
    return {
      ...defaultProvider,
      ...(savedProvider || {}),
      ...(defaultProvider.id === 'Chapa' ? {
        chapaMethods: { ...defaultProvider.chapaMethods, ...(savedProvider?.chapaMethods || {}) },
      } : {}),
      serviceEnabled,
      utilityEnabled,
      enabled: serviceEnabled || utilityEnabled,
      ...(defaultProvider.id !== 'Bank' ? { bankName: '', accountNumber: '' } : {}),
      accounts: accounts.map(account => ({
        ...account,
        enabled: account.enabled !== false,
        serviceEnabled: account.serviceEnabled ?? (account.enabled !== false),
        utilityEnabled: account.utilityEnabled ?? (account.enabled !== false),
        walletEnabled: account.walletEnabled !== false,
        ...(defaultProvider.id !== 'Bank' ? { bankName: '', accountNumber: '' } : {}),
      })),
    }
  })
}

export const getConfiguredCampaignPaymentProviders = async () => {
  const response = await serviceBookingAPI.getPaymentProviders()
  if (!response.success) throw new Error(response.message || 'Could not read payment provider settings.')
  if (!Array.isArray(response.data)) return []

  return response.data
    .filter(provider =>
      provider.serviceEnabled !== false &&
      provider.enabled !== false &&
      provider.id !== 'Chapa'
    )
    .map(provider => ({
      ...provider,
      accounts: (provider.accounts || []).filter(account =>
        account.enabled !== false && account.serviceEnabled !== false
      ),
    }))
    .filter(provider => provider.accounts.some(account =>
      account.accountName?.trim() &&
      (provider.id === 'Bank'
        ? account.bankName?.trim() && account.accountNumber?.trim()
        : account.phone?.trim())
    ))
}

export const saveServicePaymentProviders = async providers => {
  const response = await serviceBookingAPI.savePaymentProviders(providers)
  if (!response.success) throw new Error(response.message || 'Could not save payment provider settings.')
  return response.data
}

export const formatProviderUssd = (provider, amount) => {
  const template = String(provider?.ussdTemplate || '').trim()
  if (!template || !template.includes('{amount}')) return ''
  if (template.includes('{phone}') && !String(provider.phone || '').trim()) return ''
  const numericAmount = typeof amount === 'number'
    ? String(amount)
    : String(amount ?? '').replace(/[^\d.]/g, '')
  if (!numericAmount || !Number.isFinite(Number(numericAmount)) || Number(numericAmount) <= 0) return ''
  return template
    .replaceAll('{amount}', numericAmount)
    .replaceAll('{phone}', String(provider.phone || '').replace(/[^\d+]/g, ''))
}
