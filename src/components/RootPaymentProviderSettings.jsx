import { useEffect, useState } from 'react'
import {
  DEFAULT_SERVICE_PAYMENT_PROVIDERS,
  getServicePaymentProviders,
  saveServicePaymentProviders,
} from '../utils/servicePaymentSettings'
import './RootPaymentProviderSettings.css'

const EMPTY_PROVIDERS = DEFAULT_SERVICE_PAYMENT_PROVIDERS.map(provider => ({ ...provider }))

const readLogo = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Could not read the provider logo.'))
  reader.onload = () => {
    const image = new Image()
    image.onerror = () => reject(new Error('The selected provider logo is not a valid image.'))
    image.onload = () => {
      const scale = Math.min(1, 220 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Could not prepare the provider logo.'))
        return
      }
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.65))
    }
    image.src = String(reader.result)
  }
  reader.readAsDataURL(file)
})

function RootPaymentProviderSettings() {
  const [providers, setProviders] = useState(EMPTY_PROVIDERS)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    getServicePaymentProviders()
      .then(setProviders)
      .catch(loadError => setError(loadError.message))
  }, [])

  const updateProvider = (id, field, value) => {
    setProviders(current => current.map(provider =>
      provider.id === id ? { ...provider, [field]: value } : provider
    ))
    setMessage('')
  }

  const updateChapaMethod = (method, enabled) => {
    setProviders(current => current.map(provider =>
      provider.id === 'Chapa'
        ? { ...provider, chapaMethods: { ...provider.chapaMethods, [method]: enabled } }
        : provider
    ))
    setMessage('')
  }

  const updateAccount = (providerId, accountId, field, value) => {
    setProviders(current => current.map(provider =>
      provider.id === providerId
        ? { ...provider, accounts: provider.accounts.map(account =>
            account.id === accountId ? { ...account, [field]: value } : account
          ) }
        : provider
    ))
    setMessage('')
  }

  const addAccount = providerId => {
    setProviders(current => current.map(provider =>
      provider.id === providerId
        ? {
            ...provider,
            accounts: [...provider.accounts, {
              id: `${providerId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              accountName: provider.accounts[0]?.accountName || '',
              phone: '',
              accountNumber: '',
              bankName: '',
              enabled: true,
              walletEnabled: true,
              ...(provider.id === 'Bank' ? { serviceEnabled: true, utilityEnabled: true } : {}),
              ussdTemplate: provider.id === 'Telebirr'
                ? '*127*{phone}*1*{amount}#'
                : provider.id === 'Ebirr'
                  ? '*681*{phone}*{amount}#'
                  : '',
            }],
          }
        : provider
    ))
    setMessage('')
  }

  const removeAccount = (providerId, accountId) => {
    setProviders(current => current.map(provider =>
      provider.id === providerId && provider.accounts.length > 1
        ? { ...provider, accounts: provider.accounts.filter(account => account.id !== accountId) }
        : provider
    ))
    setMessage('')
  }

  const handleLogo = async (id, event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file for the provider logo.')
      event.target.value = ''
      return
    }
    try {
      const logo = await readLogo(file)
      updateProvider(id, 'logo', logo)
      setError('')
    } catch (logoError) {
      setError(logoError.message)
    } finally {
      event.target.value = ''
    }
  }

  const save = async event => {
    event.preventDefault()
    try {
      const invalidProvider = providers.find(provider => provider.id !== 'Bank' &&
        provider.accounts.some(account =>
          account.ussdTemplate?.trim() &&
          (!account.ussdTemplate.includes('{amount}') ||
            (account.ussdTemplate.includes('{phone}') && !account.phone.trim()))
        )
      )
      if (invalidProvider) {
        const invalidAccount = invalidProvider.accounts.find(account =>
          account.ussdTemplate?.trim() &&
          (!account.ussdTemplate.includes('{amount}') ||
            (account.ussdTemplate.includes('{phone}') && !account.phone.trim()))
        )
        setError(invalidAccount?.ussdTemplate.includes('{phone}') && !invalidAccount.phone.trim()
          ? `${invalidProvider.name} wallet needs a phone number because its USSD template uses {phone}.`
          : `${invalidProvider.name} USSD templates must include the {amount} placeholder.`)
        setMessage('')
        return
      }
      const normalizedProviders = providers.map(provider => {
        const accounts = provider.accounts.map(account => provider.id === 'Bank'
          ? account
          : { ...account, bankName: '', accountNumber: '' })
        return {
          ...provider,
          enabled: provider.serviceEnabled || provider.utilityEnabled,
          ...(accounts[0] || {}),
          id: provider.id,
          name: provider.name,
          logo: provider.logo,
          accounts,
        }
      })
      const savedProviders = await saveServicePaymentProviders(normalizedProviders)
      setProviders(savedProviders)
      setMessage('Payment provider settings saved.')
      setError('')
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  return (
    <section className="root-payment-settings">
      <div className="root-payment-settings-heading">
        <div>
          <h3>Payment providers</h3>
          <p>Configure provider accounts and choose where each provider is available.</p>
        </div>
      </div>
      {error && <p className="root-payment-settings-error" role="alert">{error}</p>}
      {message && <p className="root-payment-settings-success" role="status">{message}</p>}
      <form onSubmit={save}>
        <div className="root-payment-provider-grid">
          {providers.map(provider => (
            <fieldset className="root-payment-provider-card" key={provider.id}>
              <legend>{provider.name}</legend>
              <div className="root-payment-provider-availability">
                <label>
                  <span>{provider.id === 'Chapa' ? 'Product/service bookings' : 'Product bookings &amp; posts'}</span>
                  <input
                    type="checkbox"
                    checked={provider.serviceEnabled !== false}
                    onChange={event => updateProvider(provider.id, 'serviceEnabled', event.target.checked)}
                    aria-label={`${provider.name} for ${provider.id === 'Chapa' ? 'product and service bookings' : 'product bookings and posts'}`}
                  />
                </label>
                <label>
                  <span>Utility payments</span>
                  <input
                    type="checkbox"
                    checked={provider.id === 'Chapa' ? false : provider.utilityEnabled !== false}
                    onChange={event => updateProvider(provider.id, 'utilityEnabled', event.target.checked)}
                    aria-label={`${provider.name} for utility payments`}
                    disabled={provider.id === 'Chapa'}
                  />
                </label>
              </div>
              <div className="root-payment-provider-logo-area">
                {provider.logo
                  ? <img src={provider.logo} alt={`${provider.name} logo`} />
                  : <span>{provider.id === 'Bank' ? '🏦' : '📱'}</span>}
                <label>
                  Provider logo
                  <input type="file" accept="image/*" onChange={event => handleLogo(provider.id, event)} />
                </label>
              </div>
              <label>Display name
                <input value={provider.name} onChange={event => updateProvider(provider.id, 'name', event.target.value)} />
              </label>
              {provider.id === 'Chapa' ? (
                <div className="root-payment-accounts">
                  <div className="root-payment-account">
                    <label className="root-payment-account-visibility">
                      <span>Enable automatic Chapa checkout</span>
                      <input
                        type="checkbox"
                        checked={provider.automaticEnabled === true}
                        onChange={event => updateProvider(provider.id, 'automaticEnabled', event.target.checked)}
                      />
                    </label>
                    <label>Chapa secret API key {provider.chapaApiKeyConfigured && <small>Configured and encrypted; leave blank to retain it.</small>}
                      <input
                        type="password"
                        value={provider.chapaApiKey || ''}
                        onChange={event => updateProvider(provider.id, 'chapaApiKey', event.target.value)}
                        autoComplete="new-password"
                        placeholder={provider.chapaApiKeyConfigured ? 'Saved securely' : 'CHASECK-...'}
                      />
                    </label>
                    <label>HTTPS return URL
                      <input
                        type="url"
                        value={provider.chapaReturnUrl || ''}
                        onChange={event => updateProvider(provider.id, 'chapaReturnUrl', event.target.value)}
                        placeholder="https://api.example.com/api/v1/service-bookings/chapa/return"
                      />
                    </label>
                    <small>Customers complete payment on Chapa's hosted checkout and choose only payment methods enabled for your Chapa merchant account. REDSEA verifies the transaction server-side before marking it paid. This checkout is currently for product/service bookings, not utility payments.</small>
                    <div className="root-payment-chapa-methods">
                      <strong>Chapa checkout methods</strong>
                      <small>These are checkout channels, not separate provider API keys. A channel must also be active for the Chapa merchant account. Laki Pay and Santim Pay are not available in Chapa's supported payment_options; configure them directly only if their official API is supplied.</small>
                      {[
                        ['telebirr', 'Telebirr'],
                        ['cbe', 'CBE Birr'],
                        ['amole', 'Amole'],
                        ['awash', 'Awash'],
                        ['mpesa', 'M-Pesa'],
                      ].map(([method, label]) => (
                        <label key={method} className="root-payment-account-visibility">
                          <span>{label}</span>
                          <input
                            type="checkbox"
                            checked={provider.chapaMethods?.[method] === true}
                            onChange={event => updateChapaMethod(method, event.target.checked)}
                          />
                        </label>
                      ))}
                    </div>
                    <span className={`root-payment-provider-status ${provider.chapaApiKeyConfigured ? 'configured' : ''}`}>
                      {provider.chapaApiKeyConfigured ? 'Chapa API key configured' : 'Chapa API key not configured'}
                    </span>
                  </div>
                </div>
              ) : <div className="root-payment-accounts">
                <div className="root-payment-accounts-heading">
                  <strong>{provider.id === 'Bank' ? 'Bank accounts' : 'Wallet accounts'}</strong>
                  <button type="button" onClick={() => addAccount(provider.id)}>
                    + Add {provider.id === 'Bank' ? 'bank account' : 'wallet'}
                  </button>
                </div>
                {provider.accounts.map((account, index) => (
                  <div className="root-payment-account" key={account.id}>
                    <div className="root-payment-account-heading">
                      <strong>{provider.id === 'Bank' ? `Bank account ${index + 1}` : `Wallet ${index + 1}`}</strong>
                      <div className="root-payment-account-actions">
                        {provider.accounts.length > 1 && (
                          <button type="button" onClick={() => removeAccount(provider.id, account.id)}>Remove</button>
                        )}
                      </div>
                    </div>
                    <label className="root-payment-account-visibility">
                      <span>Wallet deposits &amp; withdrawals, agent transfers</span>
                      <input
                        type="checkbox"
                        checked={account.walletEnabled === true}
                        onChange={event => updateAccount(provider.id, account.id, 'walletEnabled', event.target.checked)}
                        aria-label={`Enable ${provider.name} account for wallet deposits, withdrawals, and agent transfers`}
                      />
                    </label>
                    {provider.id === 'Bank' && (
                      <div className="root-payment-account-channel-settings">
                        <label className="root-payment-account-visibility">
                          <span>Product/service bookings &amp; posts</span>
                          <input
                            type="checkbox"
                            checked={account.serviceEnabled !== false}
                            onChange={event => updateAccount(provider.id, account.id, 'serviceEnabled', event.target.checked)}
                            aria-label={`Enable ${account.bankName || `bank account ${index + 1}`} for product and service payments`}
                          />
                        </label>
                        <label className="root-payment-account-visibility">
                          <span>Utility payments</span>
                          <input
                            type="checkbox"
                            checked={account.utilityEnabled !== false}
                            onChange={event => updateAccount(provider.id, account.id, 'utilityEnabled', event.target.checked)}
                            aria-label={`Enable ${account.bankName || `bank account ${index + 1}`} for utility payments`}
                          />
                        </label>
                      </div>
                    )}
                    <label>Account holder
                      <input value={account.accountName} onChange={event => updateAccount(provider.id, account.id, 'accountName', event.target.value)} />
                    </label>
                    {provider.id === 'Bank' ? (
                      <>
                        <label>Bank name
                          <input value={account.bankName} onChange={event => updateAccount(provider.id, account.id, 'bankName', event.target.value)} />
                        </label>
                        <label>Account number
                          <input value={account.accountNumber} onChange={event => updateAccount(provider.id, account.id, 'accountNumber', event.target.value)} />
                        </label>
                      </>
                    ) : (
                      <>
                        <label>Wallet phone number
                          <input value={account.phone} onChange={event => updateAccount(provider.id, account.id, 'phone', event.target.value)} />
                        </label>
                        <label>USSD template
                          <input
                            value={account.ussdTemplate}
                            onChange={event => updateAccount(provider.id, account.id, 'ussdTemplate', event.target.value)}
                            placeholder="USSD code containing {phone} and {amount}"
                          />
                          <small>Use {'{phone}'} and {'{amount}'} placeholders. Leave blank if this wallet does not use USSD.</small>
                        </label>
                      </>
                    )}
                  </div>
                ))}
              </div>}
            </fieldset>
          ))}
        </div>
        <button className="root-payment-settings-save" type="submit">Save provider settings</button>
      </form>
    </section>
  )
}

export default RootPaymentProviderSettings
