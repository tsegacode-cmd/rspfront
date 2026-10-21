import { useEffect, useMemo, useState } from 'react'
import { getServicePaymentProviders } from '../utils/servicePaymentSettings'
import {
  getUtilitySettings,
  getUtilityProductCards,
  getMyUtilityRequests,
  createUtilityRequest,
  getUtilityPaymentProofs,
} from '../utils/utilityPayments'
import './UtilityPayment.css'

const METHOD_ICONS = { Telebirr: '📱', Ebirr: '📲', 'CBE Birr': '🏦', Bank: '🏛️' }
const MAX_RECEIPT_FILE_SIZE = 2 * 1024 * 1024
const MAX_RECEIPT_TOTAL_SIZE = 2 * 1024 * 1024
const RECEIPT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const toNumber = (value) => {
  if (typeof value === 'number') return value
  const cleaned = String(value ?? '').replace(/[^0-9.]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '')

const readReceiptFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  const extension = file.name.split('.').pop()?.toLowerCase()
  const inferredType = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  }[extension]
  reader.onload = () => {
    if (typeof reader.result !== 'string') {
      reject(new Error(`Could not read ${file.name}.`))
      return
    }
    resolve({
      name: file.name,
      type: file.type || inferredType || '',
      size: file.size,
      dataUrl: reader.result,
    })
  }
  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
  reader.readAsDataURL(file)
})

const normalizeEthiopianPhone = (phone) => {
  const digits = normalizePhone(phone)
  if (digits.startsWith('251') && digits.length === 12) return `0${digits.slice(3)}`
  return digits
}

const getRegistrationProjectTitle = (record, defaultTitle) => {
  const savedTitle = [
    record.project_title,
    record.projectTitle,
    record.product_title,
    record.productTitle,
    record.project_name,
  ].map(title => String(title || '').trim()).find(Boolean)
  if (savedTitle) return savedTitle
  return Number(record.round || 1) === 1 ? defaultTitle : ''
}

const getSignedInProfile = () => {
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}')
    const username = user.username || profile.username || ''
    const usernameDigits = normalizePhone(username)
    return {
      phone: user.phone || user.phoneNumber || user.phone_number || profile.phone ||
        (usernameDigits.length >= 6 && usernameDigits.length <= 20 ? username : ''),
      name: user.fullName || user.full_name || username || profile.fullName || '',
    }
  } catch {
    return { phone: '', name: '' }
  }
}

function UtilityPayment() {
  const settings = useMemo(() => getUtilitySettings(), [])
  const [profile] = useState(getSignedInProfile)
  const [registeredProjects, setRegisteredProjects] = useState([])
  const [defaultProjectTitle, setDefaultProjectTitle] = useState('EBC LICENCE FEE')
  const [loadingRegistrations, setLoadingRegistrations] = useState(true)
  const [selectedCard, setSelectedCard] = useState(null)
  const [phoneEntries, setPhoneEntries] = useState([])
  const [selectedPhone, setSelectedPhone] = useState(null)
  const [utilityRequests, setUtilityRequests] = useState([])
  const [viewReceipt, setViewReceipt] = useState(null)

  // Payment amount step
  const [payAmount, setPayAmount] = useState('')
  const [providers, setProviders] = useState([])
  const [method, setMethod] = useState('')
  const [accountId, setAccountId] = useState('')
  const [txnRef, setTxnRef] = useState('')
  const [receiptPdfFile, setReceiptPdfFile] = useState(null)
  const [receiptImageFile, setReceiptImageFile] = useState(null)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    import('../services/api.js').then(({ dataRegistrationAPI }) => {
      dataRegistrationAPI.getAllRegistrations()
        .then(response => {
          if (!cancelled) {
            const registrations = response?.data || response?.registrations || []
            setRegisteredProjects(Array.isArray(registrations) ? registrations : [])
          }
        })
        .catch(loadError => {
          if (!cancelled) setError(`Could not load project registrations: ${loadError.message}`)
        })
        .finally(() => {
          if (!cancelled) setLoadingRegistrations(false)
        })
      dataRegistrationAPI.getProjectTitleSettings()
        .then(response => {
          const savedDefault = response?.data?.defaultTitle
          if (!cancelled && typeof savedDefault === 'string' && savedDefault.trim()) {
            setDefaultProjectTitle(savedDefault.trim())
          }
        })
        .catch(loadError => {
          if (!cancelled) setError(`Could not load saved project titles: ${loadError.message}`)
        })
    }).catch(loadError => {
      if (!cancelled) {
        setError(`Could not load project registrations: ${loadError.message}`)
        setLoadingRegistrations(false)
      }
    })
    getServicePaymentProviders()
      .then(setProviders)
      .catch(loadError => setError(loadError.message))
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let active = true
    const refreshRequests = () => {
      getMyUtilityRequests()
        .then(requests => { if (active) setUtilityRequests(requests) })
        .catch(loadError => {
          if (active) setError(`Could not load your utility requests: ${loadError.message}`)
        })
    }
    refreshRequests()
    const timer = window.setInterval(refreshRequests, 15000)
    window.addEventListener('redsea:utility-payments', refreshRequests)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('redsea:utility-payments', refreshRequests)
    }
  }, [])

  const currentPhone = normalizeEthiopianPhone(profile.phone)
  const requests = utilityRequests
  const myRequests = useMemo(() => [...requests]
    .sort((left, right) => new Date(right.requestedAt || 0) - new Date(left.requestedAt || 0)), [requests])
  const productCards = getUtilityProductCards()
  const accountCards = registeredProjects.flatMap((registration, index) => {
    if (!currentPhone) return []
    const registrationPhone = registration.client_phone || registration.phone || registration.phone_no
    if (normalizeEthiopianPhone(registrationPhone) !== currentPhone) return []

    const projectTitle = getRegistrationProjectTitle(registration, defaultProjectTitle)
    if (!projectTitle) return []
    const registrationId = String(registration._id || registration.id || `${projectTitle}-${index}`)
    const productCard = productCards.find(card =>
      card.title.trim().toLocaleLowerCase() === projectTitle.toLocaleLowerCase()
    )
    const cardId = `ebc-registration:${registrationId}`
    const registeredTotal = registration.commission_total ?? registration.total ?? registration.amount
    const collectedAmount = toNumber(registration.collected_amount ?? registration.paid_amount)
    const paymentStatus = String(registration.payment_status || '').trim().toLocaleLowerCase()
    const defaultAmount = String(registration.person || '').trim().toLowerCase() === 'organization'
      ? localStorage.getItem('ebc_org_default_payment')
      : localStorage.getItem('ebc_default_payment')
    const explicitAmountDue = registration.remaining_amount ?? registration.remainingAmount ??
      registration.payment_amount ?? registration.amount_due
    const amount = explicitAmountDue != null
      ? toNumber(explicitAmountDue)
      : registeredTotal != null
        ? Math.max(0, toNumber(registeredTotal) - collectedAmount)
        : paymentStatus === 'paid'
          ? 0
          : toNumber(registration.paid_amount ?? defaultAmount)
    const registeredEntry = {
      id: registrationId,
      registrationId,
      phone: registrationPhone,
      ownerName: registration.client_name || profile.name,
      amount,
    }

    const latestRequest = requests
      .filter(request =>
        (request.registrationId === registrationId || request.cardId === cardId) &&
        normalizeEthiopianPhone(request.phone) === currentPhone
      )
      .sort((left, right) => new Date(right.requestedAt || 0) - new Date(left.requestedAt || 0))[0]
    const isPaid = paymentStatus === 'paid' ||
      (toNumber(registeredTotal) > 0 && collectedAmount >= toNumber(registeredTotal)) ||
      latestRequest?.status === 'receipt'
    const paymentPending = ['request', 'approved'].includes(latestRequest?.status)
    const price = amount || toNumber(productCard?.price)
    const card = {
      id: cardId,
      registrationId,
      serviceKey: 'ebc-registration',
      title: projectTitle,
      category: `EBC Registration · Round ${registration.round || 1}`,
      icon: productCard?.icon || '📄',
      price,
    }
    return [{
      ...card,
      registeredEntry,
      latestRequest,
      isPaid,
      paymentPending,
      paymentPendingLabel: latestRequest?.status === 'approved'
        ? 'Payment approved · waiting for receipt'
        : 'Payment request pending approval',
      canPay: !isPaid && !paymentPending && price > 0,
    }]
  })

  const openCard = (card) => {
    setSelectedCard(card)
    setPhoneEntries([card.registeredEntry])
    setSelectedPhone(null)
    setError('')
    setMessage('')
  }

  const closeCard = () => {
    setSelectedCard(null)
    setSelectedPhone(null)
  }

  const choosePhone = (entry) => {
    setSelectedPhone(entry)
    setPayAmount(String(entry.amount))
    setMethod('')
    setAccountId('')
    setTxnRef('')
    setReceiptPdfFile(null)
    setReceiptImageFile(null)
    setError('')
    setMessage('')
  }

  const selectReceiptFile = (event, kind) => {
    const file = event.target.files?.[0] || null
    const setFile = kind === 'pdf' ? setReceiptPdfFile : setReceiptImageFile
    event.target.value = ''
    if (!file) return

    const extension = file.name.split('.').pop()?.toLowerCase()
    const isPdf = kind === 'pdf' &&
      (file.type ? file.type === 'application/pdf' : extension === 'pdf')
    const isImage = kind === 'image' &&
      (file.type ? RECEIPT_IMAGE_TYPES.has(file.type) : /^(jpe?g|png|webp|gif)$/.test(extension))
    if (!isPdf && !isImage) {
      setFile(null)
      setError(kind === 'pdf'
        ? 'Choose a PDF receipt.'
        : 'Choose a JPG, PNG, WEBP, or GIF screenshot.')
      return
    }
    if (file.size > MAX_RECEIPT_FILE_SIZE) {
      setFile(null)
      setError('Each receipt file must be 2 MB or smaller.')
      return
    }
    const otherFile = kind === 'pdf' ? receiptImageFile : receiptPdfFile
    if (file.size + (otherFile?.size || 0) > MAX_RECEIPT_TOTAL_SIZE) {
      setFile(null)
      setError('PDF and image attachments must be 2 MB or smaller combined.')
      return
    }
    setFile(file)
    setError('')
  }

  const availableProviders = providers.filter(item =>
    item.utilityEnabled !== false &&
    (!item.accounts?.length || item.accounts.some(account => account.utilityEnabled !== false))
  )
  const provider = availableProviders.find(item => item.id === method)
  const providerAccounts = provider?.accounts?.length
    ? provider.accounts.filter(account => account.utilityEnabled !== false)
    : provider ? [{ id: `${provider.id}-default`, accountName: provider.accountName, phone: provider.phone, accountNumber: provider.accountNumber, bankName: provider.bankName }] : []
  const selectedAccount = providerAccounts.find(account => account.id === accountId)

  const submitPayment = async (event) => {
    event.preventDefault()
    const amount = toNumber(payAmount)
    if (!selectedPhone) { setError('Choose a phone number first.'); return }
    if (amount <= 0) { setError('Enter an amount greater than zero.'); return }
    if (!method) { setError('Choose a payment method.'); return }
    if (!selectedAccount) { setError('Choose a payment account.'); return }
    try {
      const [paymentReceiptPdf, paymentReceiptImage] = await Promise.all([
        receiptPdfFile ? readReceiptFile(receiptPdfFile) : null,
        receiptImageFile ? readReceiptFile(receiptImageFile) : null,
      ])
      await createUtilityRequest({
        card: selectedCard,
        phoneEntry: { ...selectedPhone, amount },
        paymentMethod: method,
        paymentAccount: selectedAccount,
        transactionReference: txnRef,
        paymentReceiptPdf,
        paymentReceiptImage,
      })
      setUtilityRequests(await getMyUtilityRequests())
      setError('')
      setMessage(`Your utility payment request of ETB ${amount.toLocaleString()} was submitted. Waiting for approval.`)
      setSelectedPhone(null)
      setSelectedCard(null)
      setReceiptPdfFile(null)
      setReceiptImageFile(null)
    } catch (submitError) {
      setError(submitError.message)
    }
  }


  return (
    <div className="up-page">
      <div className="up-hero">
        <div className="up-hero-inner">
          <span className="up-hero-icon">🧾</span>
          <div>
            <h1>{settings.title}</h1>
            <p>{settings.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="up-container">
        {message && <div className="up-alert success" role="status">{message}</div>}
        {error && <div className="up-alert error" role="alert">{error}</div>}

        {loadingRegistrations ? (
          <div className="up-empty" role="status"><p>Loading registered projects…</p></div>
        ) : accountCards.length === 0 ? (
          <div className="up-empty">
            <span>🗂️</span>
            <p>
              {!normalizePhone(profile.phone)
                ? 'A phone number is not set on your account, so no utility payments are available.'
                : 'No utility products are registered to your login phone number.'}
            </p>
          </div>
        ) : (
          <div className="up-grid">
            {accountCards.map(card => (
              <button
                type="button"
                key={card.id}
                className="up-card"
                onClick={() => openCard(card)}
              >
                <span className="up-card-icon">{card.icon}</span>
                <span className="up-card-category">{card.category}</span>
                <h3 className="up-card-title">{card.title}</h3>
                <span className="up-card-registered">
                  {card.registeredEntry.ownerName || profile.name || 'Registered account'} · {card.registeredEntry.phone}
                </span>
                <span className="up-card-price">ETB {card.registeredEntry.amount.toLocaleString()}</span>
                <span className={`up-payment-status ${card.isPaid ? 'paid' : 'unpaid'}`}>
                  {card.isPaid ? 'PAID' : 'UNPAID'}
                </span>
                {card.paymentPending
                  ? <span className="up-card-cta pending">{card.paymentPendingLabel}</span>
                  : card.canPay
                    ? <span className="up-card-cta">Pay now →</span>
                    : null}
              </button>
            ))}
          </div>
        )}

        <section className="up-account-payments" aria-labelledby="up-account-payments-title">
          <h2 id="up-account-payments-title">My utility payments and receipts</h2>
          {myRequests.length === 0 ? (
            <p className="up-account-empty">Submitted payment requests and approved receipts will appear here.</p>
          ) : (
            <div className="up-receipts-table-wrap">
              <table className="up-receipts-table">
                <thead>
                  <tr><th>Service</th><th>Amount</th><th>Method</th><th>Status</th><th>Receipt</th><th>Options</th></tr>
                </thead>
                <tbody>
                  {myRequests.map(request => (
                    <tr key={request.id}>
                      <td>{request.cardTitle}</td>
                      <td>ETB {toNumber(request.amount).toLocaleString()}</td>
                      <td>{request.paymentMethod}</td>
                      <td><span className={`up-request-status ${request.status}`}>
                        {request.status === 'receipt' ? 'Receipt approved' : request.status === 'approved' ? 'Payment approved' : request.status === 'cancelled' ? 'Cancelled' : 'Pending approval'}
                      </span></td>
                      <td>{request.receiptNumber || '—'}</td>
                      <td className="up-receipt-actions">
                        {getUtilityPaymentProofs(request).map(file => (
                          <a
                            key={`${request.id}-${file.name}`}
                            className="up-receipt-action"
                            href={file.dataUrl}
                            download={file.name}
                          >
                            {file.name.toLowerCase().endsWith('.pdf') ? 'Payment PDF' : 'Payment image'}
                          </a>
                        ))}
                        {request.receiptPdf && (
                          <>
                            <button type="button" className="up-receipt-action" onClick={() => setViewReceipt(request)}>View</button>
                            <a className="up-receipt-action" href={request.receiptPdf} download={`${request.receiptNumber || 'utility-receipt'}.pdf`}>Download</a>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      {/* Card popup: registered phone and payment status */}
      {selectedCard && !selectedPhone && (
        <div className="up-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeCard() }}>
          <div className="up-modal" role="dialog" aria-modal="true" aria-label={selectedCard.title}>
            <div className="up-modal-header">
              <div>
                <span className="up-modal-cat">{selectedCard.category}</span>
                <h2>{selectedCard.title}</h2>
              </div>
              <button type="button" onClick={closeCard} aria-label="Close">×</button>
            </div>

            <div className="up-modal-body">
              <h3 className="up-section-title">Registered phone numbers</h3>
              {phoneEntries.length > 0 && (
                <ul className="up-phone-list">
                  {phoneEntries.map(entry => (
                    <li key={entry.id}>
                      {selectedCard.canPay ? (
                        <button type="button" className="up-phone-btn" onClick={() => choosePhone(entry)}>
                          <span className="up-phone-num">📞 {entry.phone}</span>
                          <span className="up-phone-amount">ETB {entry.amount.toLocaleString()}</span>
                          {entry.ownerName && <span className="up-phone-owner">{entry.ownerName}</span>}
                        </button>
                      ) : (
                        <div className="up-phone-btn up-phone-readonly">
                          <span className="up-phone-num">📞 {entry.phone}</span>
                          <span className="up-phone-amount">ETB {entry.amount.toLocaleString()}</span>
                          {entry.ownerName && <span className="up-phone-owner">{entry.ownerName}</span>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!selectedCard.canPay && (
                <p className={`up-payment-status ${selectedCard.isPaid ? 'paid' : 'unpaid'}`}>
                  {selectedCard.isPaid
                    ? 'PAID'
                    : selectedCard.paymentPending
                      ? 'UNPAID — your payment request is waiting for approval.'
                      : 'UNPAID'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment step: amount -> method -> submit */}
      {selectedPhone && (
        <div className="up-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedPhone(null) }}>
          <div className="up-modal" role="dialog" aria-modal="true" aria-label="Payment">
            <div className="up-modal-header">
              <div>
                <span className="up-modal-cat">Pay for {selectedCard.title}</span>
                <h2>📞 {selectedPhone.phone}</h2>
              </div>
              <button type="button" onClick={() => setSelectedPhone(null)} aria-label="Close">×</button>
            </div>

            <form className="up-modal-body" onSubmit={submitPayment}>
              <label className="up-amount-label">Payment amount (ETB)
                <input type="number" min="0" step="0.01" value={payAmount} onChange={event => setPayAmount(event.target.value)} required />
              </label>

              <h3 className="up-section-title">Payment method</h3>
              <div className="up-methods">
                {availableProviders.map(item => (
                  <button
                    type="button"
                    key={item.id}
                    className={`up-method ${method === item.id ? 'active' : ''}`}
                    onClick={() => {
                      setMethod(item.id)
                      setAccountId(item.accounts?.find(account => account.utilityEnabled !== false)?.id || '')
                    }}
                  >
                    <span className="up-method-icon">{METHOD_ICONS[item.id] || '💳'}</span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              {availableProviders.length === 0 && (
                <p className="up-note">No payment methods are currently available. Please contact support.</p>
              )}

              {provider && (
                <label className="up-amount-label">Choose account
                  <select value={accountId} onChange={event => setAccountId(event.target.value)} required>
                    <option value="">Select an account</option>
                    {providerAccounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.accountName}{account.phone ? ` · ${account.phone}` : ''}{account.bankName ? ` · ${account.bankName}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {provider && (
                <label className="up-amount-label">Transaction reference
                  <input type="text" value={txnRef} onChange={event => setTxnRef(event.target.value)} placeholder="Receipt / transaction ID" />
                </label>
              )}

              <h3 className="up-section-title">Payment receipt (optional)</h3>
              <label className="up-amount-label">PDF receipt
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={event => selectReceiptFile(event, 'pdf')}
                />
                <small>{receiptPdfFile ? receiptPdfFile.name : 'PDF; PDF and image attachments limited to 2 MB combined'}</small>
              </label>
              <label className="up-amount-label">Image screenshot
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                  onChange={event => selectReceiptFile(event, 'image')}
                />
                <small>{receiptImageFile ? receiptImageFile.name : 'JPG, PNG, WEBP, or GIF; 2 MB combined limit'}</small>
              </label>
              <p className="up-note">You may attach a PDF, an image screenshot, or both. Attachments will be included with your request for the root administrator to review.</p>

              {error && <p className="up-error" role="alert">{error}</p>}

              <div className="up-modal-actions">
                <button type="button" className="up-cancel" onClick={() => setSelectedPhone(null)}>Back</button>
                <button type="submit" className="up-submit">Submit payment for approval</button>
              </div>
              <p className="up-note">Payment is verified manually. Your request stays pending until an administrator approves it.</p>
            </form>
          </div>
        </div>
      )}
      {viewReceipt?.receiptPdf && (
        <div className="up-modal-overlay up-receipt-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget) setViewReceipt(null)
        }}>
          <div className="up-receipt-viewer" role="dialog" aria-modal="true" aria-label={`Receipt ${viewReceipt.receiptNumber}`}>
            <div className="up-modal-header">
              <div>
                <span className="up-modal-cat">Verified payment receipt</span>
                <h2>{viewReceipt.receiptNumber}</h2>
              </div>
              <button type="button" onClick={() => setViewReceipt(null)} aria-label="Close receipt">×</button>
            </div>
            <iframe title={`Receipt ${viewReceipt.receiptNumber}`} src={viewReceipt.receiptPdf} />
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

export default UtilityPayment
