import { useEffect, useMemo, useState } from 'react'
import {
  getUserAccounts,
  resetUserPassword,
  generatePassword,
  pushNotification,
} from '../../../../utils/guestAccount'
import { rootAPI } from '../../../../services/api'
import Pagination, { getPageItems, PAGE_SIZE } from '../../../../components/Pagination'
import {
  getUtilityRequests,
  getUtilityPaymentProofs,
  approveUtilityPayment,
  approveUtilityReceipt,
  cancelUtilityRequest,
} from '../../../../utils/utilityPayments'
import './RootUtilityControl.css'

const fmtDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

const isExpired = expiresAt => !expiresAt || Date.parse(expiresAt) < Date.now()

/**
 * RootUtilityControl
 * ------------------
 * Root/admin panel with two areas:
 *   1. OTP Control — generated OTPs from self-created upgrade requests with
 *      all user info + 24h expiration, password give/reset, and approve.
 *   2. Utility Payments — Request -> Approve Payment -> Receipt Approve tabs.
 */
function RootUtilityControl() {
  const [section, setSection] = useState('otp') // 'otp' | 'utility'
  const [requests, setRequests] = useState([])
  const [accounts, setAccounts] = useState([])
  const [utilityRequests, setUtilityRequests] = useState([])
  const [payTab, setPayTab] = useState('request') // request | approved | receipt
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [manualReceipt, setManualReceipt] = useState({}) // requestId -> string
  const [viewReceipt, setViewReceipt] = useState(null)
  const [listPages, setListPages] = useState({})

  const visibleItems = (items, key) => {
    const page = Math.min(listPages[key] || 0, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1))
    return getPageItems(items, page)
  }

  const renderPagination = (items, key, label) => (
    <Pagination
      page={Math.min(listPages[key] || 0, Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1))}
      itemCount={items.length}
      onPageChange={page => setListPages(current => ({ ...current, [key]: page }))}
      label={label}
    />
  )

  const reload = async () => {
    try {
      const [upgradeResponse, utilityResponse] = await Promise.all([
        rootAPI.getGuestUpgradeRequests(),
        getUtilityRequests(),
      ])
      setRequests(upgradeResponse.data || [])
      setUtilityRequests(utilityResponse)
    } catch (loadError) {
      notify(loadError.message || 'Could not load Root requests.', true)
    }
    setAccounts(getUserAccounts())
  }

  useEffect(() => {
    reload()
    const timer = window.setInterval(reload, 15000)
    return () => window.clearInterval(timer)
  }, [])

  const notify = (text, isError = false) => {
    if (isError) setError(text); else { setMessage(text); setError('') }
    setTimeout(() => { setMessage(''); setError('') }, 3500)
  }

  const handleApproveOTP = async requestId => {
    try {
      await rootAPI.approveGuestUpgradeRequest(requestId)
      await reload()
      notify('Request approved. The user will see the OTP in their account form.')
    } catch (approveError) {
      notify(approveError.message, true)
    }
  }

  const handleGivePassword = (phone) => {
    try {
      const generated = generatePassword(10)
      resetUserPassword(phone, generated)
      // Delivered to the account owner's notification bell + popup.
      pushNotification({
        type: 'password_reset',
        title: 'New password issued',
        message: `The administrator issued a new password for ${phone}. Use it to sign in, then change it from your profile.`,
        phone,
        password: generated,
      })
      reload()
      notify(`New password for ${phone}: ${generated} (also sent to their notification popup).`)
    } catch (resetError) {
      notify(resetError.message, true)
    }
  }

  const handleApprovePayment = async requestId => {
    try {
      await approveUtilityPayment(requestId)
      await reload()
      notify('Payment approved. You can now issue the receipt.')
    } catch (approveError) {
      notify(approveError.message, true)
    }
  }

  const handleApproveReceipt = async requestId => {
    try {
      await approveUtilityReceipt(requestId, manualReceipt[requestId] || '')
      setManualReceipt(prev => ({ ...prev, [requestId]: '' }))
      await reload()
      setPayTab('receipt')
      notify('Receipt approved and generated. It was added to the client profile approved section.')
    } catch (receiptError) {
      notify(receiptError.message, true)
    }
  }

  const handleCancel = async requestId => {
    try {
      await cancelUtilityRequest(requestId)
      await reload()
      notify('Request cancelled.')
    } catch (cancelError) {
      notify(cancelError.message, true)
    }
  }

  const pendingRequests = useMemo(() => utilityRequests.filter(r => r.status === 'request'), [utilityRequests])
  const approvedPayments = useMemo(() => utilityRequests.filter(r => r.status === 'approved'), [utilityRequests])
  const receiptDone = useMemo(() => utilityRequests.filter(r => r.status === 'receipt'), [utilityRequests])


  return (
    <div className="ruc">
      <div className="ruc-section-switch">
        <button className={section === 'otp' ? 'active' : ''} onClick={() => setSection('otp')}>🔐 OTP Control</button>
        <button className={section === 'utility' ? 'active' : ''} onClick={() => setSection('utility')}>🧾 Utility Payments</button>
      </div>

      {message && <div className="ruc-alert success" role="status">{message}</div>}
      {error && <div className="ruc-alert error" role="alert">{error}</div>}

      {section === 'otp' && (
        <div className="ruc-panel">
          <h2 className="ruc-title">OTP Control &amp; Account Approval</h2>
          <p className="ruc-desc">
            Direct signup, guest upgrade, and password reset requests are stored on the server. After approval, the user verifies the OTP in their form to finish the requested action.
          </p>

          <h3 className="ruc-subtitle">Account requests ({requests.length})</h3>
          {requests.length === 0 ? (
            <p className="ruc-empty">No account requests yet.</p>
          ) : (
            <div className="ruc-table-wrap">
              <table className="ruc-table">
                <thead>
                  <tr><th>Request</th><th>Username</th><th>Full Name</th><th>Phone</th><th>OTP</th><th>Expires</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {visibleItems(requests, 'upgrade-requests').map(request => (
                    <tr key={request.id}>
                      <td>{request.requestType === 'registration' ? 'Direct signup' : request.requestType === 'password_reset' ? 'Password reset' : 'Guest upgrade'}</td>
                      <td>{request.username || '—'}</td>
                      <td>{request.fullName}</td>
                      <td>{request.phone}</td>
                      <td className="ruc-otp">{request.status === 'approved' || request.status === 'completed' ? 'Sent securely' : 'Pending'}</td>
                      <td>
                        {fmtDate(request.otpExpiresAt || request.expiresAt)}
                        {request.status !== 'completed' && isExpired(request.otpExpiresAt || request.expiresAt) && (
                          <span className="ruc-expired">expired</span>
                        )}
                      </td>
                      <td><span className={`ruc-badge ${request.status}`}>{request.status}</span></td>
                      <td>
                        {request.status === 'pending' && (
                          <button className="ruc-act approve" onClick={() => handleApproveOTP(request.id)}>Approve</button>
                        )}
                        {request.status === 'approved' && <span className="ruc-muted">awaiting user OTP</span>}
                        {request.status === 'completed' && <span className="ruc-muted">{request.requestType === 'password_reset' ? 'password reset' : 'completed'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {renderPagination(requests, 'upgrade-requests', 'account requests')}
            </div>
          )}

          <h3 className="ruc-subtitle">Created user accounts ({accounts.length})</h3>
          {accounts.length === 0 ? (
            <p className="ruc-empty">No user accounts created yet.</p>
          ) : (
            <div className="ruc-table-wrap">
              <table className="ruc-table">
                <thead>
                  <tr><th>Full Name</th><th>Phone</th><th>Created</th><th>Password</th></tr>
                </thead>
                <tbody>
                  {visibleItems(accounts, 'created-accounts').map(account => (
                    <tr key={account.id}>
                      <td>{account.fullName}</td>
                      <td>{account.phone}</td>
                      <td>{fmtDate(account.createdAt)}</td>
                      <td>
                        <button className="ruc-act reset" onClick={() => handleGivePassword(account.phone)}>
                          Give / Reset password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {renderPagination(accounts, 'created-accounts', 'created user accounts')}
            </div>
          )}
        </div>
      )}

      {section === 'utility' && (
        <div className="ruc-panel">
          <h2 className="ruc-title">Utility Payment Management</h2>
          <div className="ruc-tabs">
            <button className={payTab === 'request' ? 'active' : ''} onClick={() => setPayTab('request')}>
              Request ({pendingRequests.length})
            </button>
            <button className={payTab === 'approved' ? 'active' : ''} onClick={() => setPayTab('approved')}>
              Approve Payment ({approvedPayments.length})
            </button>
            <button className={payTab === 'receipt' ? 'active' : ''} onClick={() => setPayTab('receipt')}>
              Receipt ({receiptDone.length})
            </button>
          </div>

          {payTab === 'request' && (
            pendingRequests.length === 0 ? <p className="ruc-empty">No pending payment requests.</p> : (
              <div className="ruc-table-wrap">
                <table className="ruc-table">
                  <thead>
                    <tr><th>Product</th><th>Phone</th><th>Amount</th><th>Method</th><th>Payment proof</th><th>Requested</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {visibleItems(pendingRequests, 'pending-utility').map(request => (
                      <tr key={request.id}>
                        <td>{request.cardTitle}<br /><small>{request.category}</small></td>
                        <td>{request.phone}</td>
                        <td className="ruc-amount">ETB {Number(request.amount).toLocaleString()}</td>
                        <td>{request.paymentMethod}</td>
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
                        <td>{fmtDate(request.requestedAt)}</td>
                        <td>
                          <button className="ruc-act approve" onClick={() => handleApprovePayment(request.id)}>Approve Payment</button>
                          <button className="ruc-act delete" onClick={() => handleCancel(request.id)}>Cancel</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {renderPagination(pendingRequests, 'pending-utility', 'pending utility payments')}
              </div>
            )
          )}

          {payTab === 'approved' && (
            approvedPayments.length === 0 ? <p className="ruc-empty">No payments awaiting receipt.</p> : (
              <div className="ruc-table-wrap">
                <table className="ruc-table">
                  <thead>
                    <tr><th>Product</th><th>Phone</th><th>Amount</th><th>Method</th><th>Approved</th><th>Manual Receipt</th><th>Action</th></tr>
                  </thead>
                  <tbody>
                    {visibleItems(approvedPayments, 'approved-utility').map(request => (
                      <tr key={request.id}>
                        <td>{request.cardTitle}</td>
                        <td>{request.phone}</td>
                        <td className="ruc-amount">ETB {Number(request.amount).toLocaleString()}</td>
                        <td>{request.paymentMethod}</td>
                        <td>{fmtDate(request.approvedAt)}</td>
                        <td>
                          <input
                            className="ruc-input"
                            placeholder="Manual receipt number (required)"
                            aria-label={`Manual receipt number for ${request.cardTitle}`}
                            value={manualReceipt[request.id] || ''}
                            onChange={event => setManualReceipt(prev => ({ ...prev, [request.id]: event.target.value }))}
                          />
                        </td>
                        <td>
                          <button className="ruc-act receipt" onClick={() => handleApproveReceipt(request.id)}>Approve Receipt</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {renderPagination(approvedPayments, 'approved-utility', 'approved utility payments')}
              </div>
            )
          )}

          {payTab === 'receipt' && (
            receiptDone.length === 0 ? <p className="ruc-empty">No completed receipts yet.</p> : (
              <div className="ruc-table-wrap">
                <table className="ruc-table">
                  <thead>
                    <tr><th>Receipt No.</th><th>Product</th><th>Phone</th><th>Amount</th><th>Manual</th><th>Issued</th><th>PDF</th></tr>
                  </thead>
                  <tbody>
                    {visibleItems(receiptDone, 'completed-receipts').map(request => (
                      <tr key={request.id}>
                        <td>{request.receiptNumber}</td>
                        <td>{request.cardTitle}</td>
                        <td>{request.phone}</td>
                        <td className="ruc-amount">ETB {Number(request.amount).toLocaleString()}</td>
                        <td>{request.manualReceipt}</td>
                        <td>{fmtDate(request.receiptAt)}</td>
                        <td>
                          {request.receiptPdf && (
                            <>
                              <button className="ruc-act pdf" type="button" onClick={() => setViewReceipt(request)}>View</button>
                              <a className="ruc-act pdf" href={request.receiptPdf} download={`${request.receiptNumber}.pdf`}>Download</a>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {renderPagination(receiptDone, 'completed-receipts', 'completed receipts')}
              </div>
            )
          )}
          {viewReceipt?.receiptPdf && (
            <div className="ruc-receipt-overlay" role="presentation" onMouseDown={event => {
              if (event.target === event.currentTarget) setViewReceipt(null)
            }}>
              <section className="ruc-receipt-viewer" role="dialog" aria-modal="true" aria-label={`Receipt ${viewReceipt.receiptNumber}`}>
                <div className="ruc-receipt-viewer-header">
                  <strong>Receipt {viewReceipt.receiptNumber}</strong>
                  <button type="button" onClick={() => setViewReceipt(null)} aria-label="Close receipt">×</button>
                </div>
                <iframe title={`Receipt ${viewReceipt.receiptNumber}`} src={viewReceipt.receiptPdf} />
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RootUtilityControl
