import { useEffect, useState } from 'react'
import { serviceBookingAPI } from '../services/api'
import { formatProviderUssd, getServicePaymentProviders } from '../utils/servicePaymentSettings'
import './BookingPaymentModal.css'

const PAYMENT_TYPES = [
  { key: 'serviceCharge', label: 'Service charge' },
  { key: 'firstPayment', label: 'First payment' },
  { key: 'fullPayment', label: 'Full payment' },
]
const WALLET_METHOD = 'REDSEA Wallet'

const toNumericAmount = value => typeof value === 'number'
  ? value
  : Number(String(value ?? '').replace(/[^\d.]/g, ''))

const formatAmount = value => {
  const numericAmount = toNumericAmount(value)
  return Number.isFinite(numericAmount) && numericAmount > 0
    ? `ETB ${numericAmount.toLocaleString()}`
    : 'Amount to be confirmed'
}

function BookingPaymentModal({ itemName, amount, paymentOptions, itemId = '', platformFeePercent = 0, deliveryEnabled = false, deliveryFee = 0, onClose, onConfirm }) {
  const [paymentMethod, setPaymentMethod] = useState('')
  const [chapaMethod, setChapaMethod] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [bankPaymentOpen, setBankPaymentOpen] = useState(false)
  const [paymentProviders, setPaymentProviders] = useState([])
  const [walletQuote, setWalletQuote] = useState(null)
  const [walletQuoteLoading, setWalletQuoteLoading] = useState(false)
  const [walletQuoteError, setWalletQuoteError] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [transactionReference, setTransactionReference] = useState('')
  const [dialerOpened, setDialerOpened] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [deliveryRequested, setDeliveryRequested] = useState(false)

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    getServicePaymentProviders()
      .then(setPaymentProviders)
      .catch(loadError => setError(loadError.message))
    try {
      const profile = JSON.parse(localStorage.getItem('userProfile') || localStorage.getItem('userData') || '{}')
      setCustomerName(profile.fullName || profile.full_name || profile.username || '')
      setCustomerEmail(profile.email || '')
      setCustomerPhone(profile.phone || '')
    } catch (profileError) {
      setError(`Could not load your account details: ${profileError.message}`)
    }
    return () => {
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  const fullPaymentRequired = Boolean(paymentOptions?.fullPayment?.required)
  const availablePayments = PAYMENT_TYPES
    .filter(option => paymentOptions?.[option.key]?.enabled)
    .filter(option => !fullPaymentRequired || option.key === 'fullPayment')
  const choices = availablePayments.length
    ? availablePayments
    : [{ key: 'fullPayment', label: 'Full payment', fallbackAmount: amount }]
  const [paymentType, setPaymentType] = useState(() => fullPaymentRequired ? 'fullPayment' : choices[0].key)
  const selectedPayment = choices.find(option => option.key === paymentType) || choices[0]
  const paymentAmount = paymentOptions?.[selectedPayment.key]?.amount ?? selectedPayment.fallbackAmount ?? amount
  const basePaymentAmount = toNumericAmount(paymentAmount)
  const walletSelected = paymentMethod === WALLET_METHOD
  const numericPlatformFee = walletSelected && walletQuote
    ? Number(walletQuote.platformServiceCharge)
    : platformFeePercent > 0 && Number.isFinite(basePaymentAmount)
    ? Math.round(basePaymentAmount * platformFeePercent) / 100
    : 0
  const numericPaymentAmount = walletSelected && walletQuote
    ? Number(walletQuote.amount)
    : Math.round((basePaymentAmount + numericPlatformFee) * 100) / 100
  const hasValidPaymentAmount = Number.isFinite(numericPaymentAmount) && numericPaymentAmount > 0
  const displayAmount = formatAmount(walletSelected && walletQuote ? walletQuote.productAmount : paymentAmount)
  const displayTotal = formatAmount(numericPaymentAmount)
  const walletEligible = Boolean(itemId) && !String(itemId).startsWith('boosted-')
  const availablePaymentProviders = paymentProviders.filter(item =>
    item.serviceEnabled !== false &&
    (item.id !== 'Chapa' || item.automaticEnabled && item.chapaApiKeyConfigured) &&
    (!item.accounts?.length || item.accounts.some(account => account.serviceEnabled !== false))
  )
  const provider = availablePaymentProviders.find(item => item.id === paymentMethod)
  const providerAccounts = provider?.accounts?.length
    ? provider.accounts.filter(account => account.serviceEnabled !== false)
    : provider ? [{
        id: `${provider.id}-default`,
        accountName: provider.accountName,
        phone: provider.phone,
        accountNumber: provider.accountNumber,
        bankName: provider.bankName,
        ussdTemplate: provider.ussdTemplate,
      }] : []
  const selectedAccount = providerAccounts.find(account => account.id === paymentAccountId) || providerAccounts[0]
  const activeProvider = provider && selectedAccount ? { ...provider, ...selectedAccount } : provider
  const ussdCode = activeProvider ? formatProviderUssd(activeProvider, numericPaymentAmount) : ''
  const isBankPayment = provider?.id === 'Bank'
  const isAutomaticChapa = provider?.id === 'Chapa' && provider.automaticEnabled && provider.chapaApiKeyConfigured
  const chapaMethods = [
    ['telebirr', 'Telebirr'],
    ['cbe', 'CBE Birr'],
    ['amole', 'Amole'],
    ['awash', 'Awash'],
    ['mpesa', 'M-Pesa'],
  ].filter(([method]) => provider?.chapaMethods?.[method] === true)

  useEffect(() => {
    if (!walletEligible) return
    let active = true
    setWalletQuoteLoading(true)
    setWalletQuote(null)
    setWalletQuoteError('')
    serviceBookingAPI.getWalletBookingQuote({ itemId, paymentType: selectedPayment.key, deliveryRequested })
      .then(response => {
        if (!response.success || !response.data) {
          throw new Error(response.message || 'Could not load the wallet booking amount.')
        }
        if (active) setWalletQuote(response.data)
      })
      .catch(quoteError => {
        if (active) {
          setWalletQuote(null)
          setWalletQuoteError(quoteError.message || 'Could not load wallet booking details.')
        }
      })
      .finally(() => {
        if (active) setWalletQuoteLoading(false)
      })
    return () => { active = false }
  }, [deliveryRequested, itemId, selectedPayment.key, walletEligible])

  const submitWalletBooking = async () => {
    if (!walletEligible || walletQuoteLoading || !walletQuote) {
      setError(walletQuoteError || 'Wallet booking details are not available. Please try again.')
      return
    }
    if (Number(walletQuote.availableBalance) < Number(walletQuote.amount)) {
      setError(`Insufficient real wallet balance. You have ETB ${Number(walletQuote.availableBalance).toFixed(2)} available; ETB ${Number(walletQuote.amount).toFixed(2)} is required.`)
      return
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Enter your name and phone number.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const succeeded = await onConfirm(WALLET_METHOD, {
        type: selectedPayment.key,
        label: selectedPayment.label,
        amount: Number(walletQuote.amount),
      }, {
        name: customerName.trim(),
        phone: customerPhone.trim(),
        transactionReference: '',
        paymentAccount: {},
        deliveryRequested,
      })
      if (succeeded === false) {
        setError('Could not complete wallet booking. Please try again.')
        setSubmitting(false)
      } else if (typeof succeeded === 'string' && succeeded) {
        setError(succeeded)
        setSubmitting(false)
      }
    } catch (bookingError) {
      setError(bookingError.message || 'Could not complete wallet booking.')
      setSubmitting(false)
    }
  }

  const submitRequest = async () => {
    if (walletSelected) {
      await submitWalletBooking()
      return
    }
    if (!provider) {
      setError('Choose a payment method.')
      return
    }
    if (!hasValidPaymentAmount) {
      setError('This payment option needs a valid amount before you can continue.')
      return
    }
    if (activeProvider?.ussdTemplate && !ussdCode) {
      setError('A valid payment amount is needed before generating this USSD code.')
      return
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Enter your name and phone number.')
      return
    }
    if (isAutomaticChapa) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
        setError('Enter a valid email address for Chapa checkout.')
        return
      }
      setError('')
      setSubmitting(true)
      try {
        const response = await serviceBookingAPI.initiateChapaPayment({
          itemName,
          category: 'Product booking',
          amount: numericPaymentAmount,
          itemId,
          paymentType: selectedPayment.key,
          paymentLabel: selectedPayment.label,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerPhone: customerPhone.trim(),
          deliveryRequested,
          chapaMethod: chapaMethods.some(([method]) => method === chapaMethod) ? chapaMethod : '',
        })
        if (!response.success || !response.data?.checkoutUrl) {
          throw new Error(response.message || 'Chapa did not return a checkout link.')
        }
        window.location.assign(response.data.checkoutUrl)
      } catch (checkoutError) {
        setError(checkoutError.message || 'Could not start Chapa checkout.')
        setSubmitting(false)
      }
      return
    }
    if (!transactionReference.trim()) {
      setError('Enter the payment transaction reference.')
      return
    }
    if (!dialerOpened && ussdCode) {
      setError('Open the payment dialer first, then submit your transaction reference.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const succeeded = await onConfirm(paymentMethod, {
        type: selectedPayment.key,
        label: selectedPayment.label,
        amount: numericPaymentAmount,
      }, {
        name: customerName.trim(),
        phone: customerPhone.trim(),
        transactionReference: transactionReference.trim(),
        paymentAccount: selectedAccount ? {
          accountName: selectedAccount.accountName || '',
          phone: selectedAccount.phone || '',
          accountNumber: selectedAccount.accountNumber || '',
          bankName: selectedAccount.bankName || '',
        } : {},
        deliveryRequested,
      })
      if (succeeded === false) {
        setError('Could not submit your request. Please try again.')
        setSubmitting(false)
      } else if (typeof succeeded === 'string' && succeeded) {
        setError(succeeded)
        setSubmitting(false)
      }
    } catch (submitError) {
      setError(submitError.message || 'Could not submit your request. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="booking-payment-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="booking-payment-modal" role="dialog" aria-modal="true" aria-labelledby="booking-payment-title">
        <button type="button" className="booking-payment-close" onClick={onClose} aria-label="Close payment dialog">×</button>
        <span className="booking-payment-icon">💳</span>
        <h2 id="booking-payment-title">Complete your booking payment</h2>
        <p className="booking-payment-item">{itemName}</p>
        {deliveryEnabled && (
          <div className="booking-delivery-option">
            <label>
              <input
                type="checkbox"
                checked={deliveryRequested}
                onChange={event => setDeliveryRequested(event.target.checked)}
              />
              <span>Request product delivery · ETB {Number(deliveryFee).toLocaleString()} due on receipt</span>
            </label>
            <p>The delivery fee is separate from this booking payment and is paid when you receive the product.</p>
          </div>
        )}
        {choices.length > 1 && <div className="booking-payment-schedule" aria-label="Payment amount">
          <span className="booking-payment-schedule-title">Choose payment amount</span>
          {choices.map(option => {
            const optionAmount = toNumericAmount(paymentOptions?.[option.key]?.amount ?? option.fallbackAmount ?? amount)
            const optionFee = platformFeePercent > 0 && Number.isFinite(optionAmount)
              ? Math.round(optionAmount * platformFeePercent) / 100
              : 0
            const optionDisplay = formatAmount(optionAmount + optionFee)
            return (
              <label className={paymentType === option.key ? 'selected' : ''} key={option.key}>
                <input
                  type="radio"
                  name="booking-payment-type"
                  value={option.key}
                  checked={paymentType === option.key}
                  onChange={() => {
                    setPaymentType(option.key)
                    setDialerOpened(false)
                    setBankPaymentOpen(false)
                  }}
                />
                <span>{option.label}</span>
                <strong>{optionDisplay}</strong>
              </label>
            )
          })}
        </div>}
        <p className="booking-payment-amount">
          {selectedPayment.label}: {platformFeePercent > 0 ? displayTotal : displayAmount}
          {fullPaymentRequired && <span className="booking-payment-required">Full payment required</span>}
        </p>
        {platformFeePercent > 0 && (
          <div className="booking-payment-fee-breakdown">
            <span>Product amount <strong>{displayAmount}</strong></span>
            <span>Platform service charge ({platformFeePercent}%) <strong>{formatAmount(numericPlatformFee)}</strong></span>
            <span>Total due <strong>{displayTotal}</strong></span>
          </div>
        )}

        <div className="booking-payment-options">
          {walletEligible && (
            <button
              type="button"
              className={`booking-payment-method ${walletSelected ? 'selected' : ''}`}
              onClick={() => {
                setPaymentMethod(WALLET_METHOD)
                setDialerOpened(false)
                setBankPaymentOpen(false)
                setError('')
              }}
            >
              <span className="booking-payment-method-icon">💰</span>
              <span>REDSEA Wallet</span>
            </button>
          )}
          {availablePaymentProviders.map(method => (
            <button
              type="button"
              className={`booking-payment-method ${paymentMethod === method.id ? 'selected' : ''}`}
              key={method.id}
              onClick={() => {
                setPaymentMethod(method.id)
                setPaymentAccountId(method.accounts?.find(account => account.serviceEnabled !== false)?.id || '')
                setDialerOpened(false)
                setBankPaymentOpen(false)
                setTransactionReference('')
                setError('')
              }}
            >
              {method.logo
                ? <img src={method.logo} alt="" />
                : <span className="booking-payment-method-icon">{method.id === 'Bank' ? '🏦' : '📱'}</span>}
              <span>{method.name}</span>
            </button>
          ))}
        </div>
        {availablePaymentProviders.length === 0 && (
          !walletEligible && <p className="booking-payment-error">No payment methods are currently available. Please contact support.</p>
        )}

        {walletSelected && (
          <div className="booking-payment-wallet-details">
            <strong>Pay from your real wallet</strong>
            {walletQuoteLoading
              ? <span>Loading verified price and available balance…</span>
              : walletQuote
                ? <>
                    <span>Available real balance <strong>ETB {Number(walletQuote.availableBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    <span>Wallet payment <strong>ETB {Number(walletQuote.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                    {Number(walletQuote.availableBalance) < Number(walletQuote.amount) && (
                      <p className="booking-payment-error" role="alert">
                        Insufficient balance. Add ETB {(Number(walletQuote.amount) - Number(walletQuote.availableBalance)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to your real wallet to book.
                      </p>
                    )}
                  </>
                : <p className="booking-payment-error" role="alert">{walletQuoteError || 'Could not load wallet booking details.'}</p>}
            <button
              type="button"
              className="booking-payment-confirm"
              onClick={submitRequest}
              disabled={submitting || walletQuoteLoading || !walletQuote || Number(walletQuote.availableBalance) < Number(walletQuote.amount)}
            >
              {submitting ? 'Booking…' : `Book with REDSEA Wallet · ${walletQuote ? formatAmount(walletQuote.amount) : '…'}`}
            </button>
          </div>
        )}

        {provider && (
          <div className="booking-payment-provider-details">
            <strong>{provider.name} payment details</strong>
            {isAutomaticChapa ? (
              <>
                <p>Continue to Chapa's secure hosted checkout. The payment methods shown there depend on the channels enabled for the REDSEA merchant account.</p>
                <label>
                  Your name
                  <input value={customerName} onChange={event => setCustomerName(event.target.value)} autoComplete="name" />
                </label>
                <label>
                  Your email address
                  <input type="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} autoComplete="email" />
                </label>
                <label>
                  Your phone number
                  <input type="tel" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} autoComplete="tel" />
                </label>
                {chapaMethods.length > 0 && (
                  <label>
                    Chapa payment method
                    <select value={chapaMethod} onChange={event => setChapaMethod(event.target.value)}>
                      <option value="">Choose on Chapa checkout</option>
                      {chapaMethods.map(([method, label]) => <option key={method} value={method}>{label}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" className="booking-payment-dial" onClick={submitRequest} disabled={submitting}>
                  {submitting ? 'Opening Chapa checkout…' : `Pay ${displayAmount} with Chapa`}
                </button>
              </>
            ) : (
              <>
            {providerAccounts.length > 1 && (
              <label className="booking-payment-account-select">
                Choose wallet / bank account
                <select
                  value={selectedAccount?.id || ''}
                  onChange={event => {
                    setPaymentAccountId(event.target.value)
                    setDialerOpened(false)
                    setBankPaymentOpen(false)
                  }}
                >
                  {providerAccounts.map((account, index) => (
                    <option key={account.id || index} value={account.id}>
                      {account.accountName || provider.name} — {account.phone || account.accountNumber || `Account ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {isBankPayment ? (
              <button
                type="button"
                className="booking-payment-dial"
                onClick={() => {
                  if (!hasValidPaymentAmount) {
                    setError('This payment option needs a valid amount before you can continue.')
                    return
                  }
                  setBankPaymentOpen(true)
                  setError('')
                }}
              >
                Pay
              </button>
            ) : (
              <>
                <span>Account name: {activeProvider?.accountName || 'Not configured'}</span>
                {activeProvider?.phone && <span>Wallet phone: {activeProvider.phone}</span>}
                {ussdCode && <code>{ussdCode}</code>}
                {activeProvider?.ussdTemplate && !ussdCode
                  ? <span className="booking-payment-error">A valid payment amount is needed before generating this USSD code.</span>
                  : ussdCode
                    ? <a
                        className="booking-payment-dial"
                        href={`tel:${ussdCode.replaceAll('#', '%23')}`}
                        onClick={() => {
                          setDialerOpened(true)
                          setError('')
                        }}
                      >
                        Pay {displayAmount} and open dialer
                      </a>
                    : <button
                        type="button"
                        className="booking-payment-dial"
                        onClick={() => {
                          setDialerOpened(true)
                          setError('')
                        }}
                      >
                        Continue after wallet payment
                      </button>}
              </>
            )}
            {provider.logo && <img className="booking-payment-provider-logo" src={provider.logo} alt={`${provider.name} logo`} />}
              </>
            )}
          </div>
        )}

        {bankPaymentOpen && isBankPayment && (
          <div className="booking-bank-payment-overlay" onMouseDown={event => {
            if (event.target === event.currentTarget) setBankPaymentOpen(false)
          }}>
            <section className="booking-bank-payment-popup" role="dialog" aria-modal="true" aria-labelledby="booking-bank-payment-title">
              <button type="button" className="booking-payment-close" onClick={() => setBankPaymentOpen(false)} aria-label="Close bank payment details">×</button>
              <h3 id="booking-bank-payment-title">Pay by bank transfer</h3>
              <p>Transfer <strong>{displayAmount}</strong> for {itemName} to this account:</p>
              <dl>
                <dt>Account holder</dt><dd>{selectedAccount?.accountName || 'Not configured'}</dd>
                <dt>Bank</dt><dd>{selectedAccount?.bankName || 'Not configured'}</dd>
                <dt>Account number</dt><dd>{selectedAccount?.accountNumber || 'Not configured'}</dd>
              </dl>
              <p>After paying, continue to enter your transaction reference, send the transaction text, and submit your payment for approval.</p>
              <button
                type="button"
                className="booking-payment-confirm"
                disabled={!selectedAccount?.accountName?.trim() || !selectedAccount?.bankName?.trim() || !selectedAccount?.accountNumber?.trim()}
                onClick={() => {
                  setBankPaymentOpen(false)
                  setDialerOpened(true)
                  setError('')
                }}
              >
                I’ve paid — continue
              </button>
              {(!selectedAccount?.accountName?.trim() || !selectedAccount?.bankName?.trim() || !selectedAccount?.accountNumber?.trim()) && (
                <p className="booking-bank-payment-missing">Bank account details are incomplete. Please contact the provider before transferring.</p>
              )}
            </section>
          </div>
        )}

        {provider && dialerOpened && !isAutomaticChapa && (
          <div className="booking-payment-submit-section">
            <label>
              Your name
              <input value={customerName} onChange={event => setCustomerName(event.target.value)} autoComplete="name" />
            </label>
            <label>
              Your phone number
              <input type="tel" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} autoComplete="tel" />
            </label>
            <label>
              Payment transaction reference
              <input
                value={transactionReference}
                onChange={event => setTransactionReference(event.target.value)}
                placeholder="Enter the receipt / transaction ID"
                required
              />
            </label>
            <p>After paying, enter the transaction reference, use “Send transaction text” to share the receipt details, then submit your request. It stays pending until approved.</p>
            <button
              type="button"
              className="booking-payment-text-transaction"
              onClick={() => {
                const message = [
                  'Service payment transaction',
                  `Service: ${itemName}`,
                  `Amount: ${displayAmount}`,
                  `Method: ${provider.name}`,
                  selectedAccount?.accountName ? `Account: ${selectedAccount.accountName}` : '',
                  selectedAccount?.bankName ? `Bank: ${selectedAccount.bankName}` : '',
                  selectedAccount?.accountNumber ? `Account number: ${selectedAccount.accountNumber}` : '',
                  selectedAccount?.phone ? `Wallet: ${selectedAccount.phone}` : '',
                  `Transaction reference: ${transactionReference.trim() || '(enter reference)'}`,
                  `Customer: ${customerName.trim()}`,
                  `Phone: ${customerPhone.trim()}`,
                ].join('\n')
                window.location.href = `sms:?body=${encodeURIComponent(message)}`
              }}
            >
              Send transaction text
            </button>
            <button type="button" className="booking-payment-confirm" onClick={submitRequest} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit payment for approval'}
            </button>
          </div>
        )}
        {error && <p className="booking-payment-error" role="alert">{error}</p>}
        {!walletSelected && <p className="booking-payment-note">Payment is not automatically verified. Keep your receipt until an administrator approves your request.</p>}
      </section>
    </div>
  )
}

export default BookingPaymentModal
