import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { serviceBookingAPI } from '../services/api'
import { getMyServiceBookingRequests } from '../utils/serviceBookingRequests'
import { getMyUtilityRequests } from '../utils/utilityPayments'
import LoginRequiredModal from '../components/LoginRequiredModal'
import './ServiceRequests.css'

const REQUEST_TABS = [
  { id: 'requests', label: 'Requests' },
  { id: 'approved', label: 'Approved' },
  { id: 'booked', label: 'Booked' },
]

function ServiceRequests() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab = REQUEST_TABS.some(tab => tab.id === requestedTab) ? requestedTab : 'requests'
  const [requests, setRequests] = useState([])
  const [utilityRequests, setUtilityRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloadingRequestId, setDownloadingRequestId] = useState('')
  const [previewingRequestId, setPreviewingRequestId] = useState('')
  const [previewFile, setPreviewFile] = useState(null)
  const [loginPrompt, setLoginPrompt] = useState({ open: false, message: '' })
  const autoOpenedRequestId = useRef('')

  const downloadProduct = async request => {
    if (!localStorage.getItem('authToken') || !localStorage.getItem('userData')) {
      setLoginPrompt({ open: true, message: 'Please log in to download this product.' })
      return
    }
    setDownloadingRequestId(request.requestId)
    setError('')
    try {
      const { blob, filename } = await serviceBookingAPI.downloadProduct(request.requestId)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename || request.downloadFilename || request.itemName || 'digital-product'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000)
    } catch (downloadError) {
      setError(downloadError.message || 'Could not download the approved product.')
    } finally {
      setDownloadingRequestId('')
    }
  }

  const openDigitalProduct = useCallback(async request => {
    if (!localStorage.getItem('authToken') || !localStorage.getItem('userData')) {
      setLoginPrompt({ open: true, message: 'Please log in to open this product.' })
      return
    }
    setPreviewingRequestId(request.requestId)
    setError('')
    try {
      const { blob, filename, contentType } = await serviceBookingAPI.previewProduct(request.requestId)
      const safeFilename = filename || request.downloadFilename || request.itemName || 'Digital product'
      const suppliedType = contentType || blob.type || ''
      const extension = safeFilename.toLowerCase().split('.').pop()
      const extensionTypes = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        mp4: 'video/mp4',
        webm: 'video/webm',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
      }
      const resolvedType = suppliedType && suppliedType !== 'application/octet-stream'
        ? suppliedType
        : extensionTypes[extension] || suppliedType || 'application/octet-stream'
      const objectUrl = URL.createObjectURL(new Blob([blob], { type: resolvedType }))
      setPreviewFile({ url: objectUrl, filename: safeFilename, contentType: resolvedType })
    } catch (previewError) {
      setError(previewError.message || 'Could not open the approved product.')
    } finally {
      setPreviewingRequestId('')
    }
  }, [])

  useEffect(() => {
    if (!previewFile?.url) return undefined
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = oldOverflow
      URL.revokeObjectURL(previewFile.url)
    }
  }, [previewFile?.url])

  useEffect(() => {
    const requestId = searchParams.get('open')
    if (!requestId || loading || previewFile || previewingRequestId || autoOpenedRequestId.current === requestId) return
    const request = requests.find(item => String(item.requestId) === requestId)
    if (!request || !request.digitalProductAvailable || request.paymentStatus !== 'approved') return
    autoOpenedRequestId.current = requestId
    openDigitalProduct(request)
  }, [searchParams, loading, previewFile, previewingRequestId, requests, openDigitalProduct])

  useEffect(() => {
    let mounted = true
    let refreshing = false
    const refreshRequests = async () => {
      if (!mounted || refreshing) return
      refreshing = true
      try {
        const data = await getMyServiceBookingRequests()
        if (mounted) {
          setRequests(data)
          setError('')
        }
      } catch (loadError) {
        if (mounted) setError(loadError.message || 'Could not load your booking history.')
      } finally {
        refreshing = false
        if (mounted) setLoading(false)
      }
    }
    refreshRequests()
    const timer = window.setInterval(refreshRequests, 15000)
    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let active = true
    const refreshUtilityRequests = () => {
      getMyUtilityRequests()
        .then(data => { if (active) setUtilityRequests(data) })
        .catch(loadError => { if (active) setError(loadError.message || 'Could not load utility requests.') })
    }
    refreshUtilityRequests()
    const timer = window.setInterval(refreshUtilityRequests, 15000)
    window.addEventListener('redsea:utility-payments', refreshUtilityRequests)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('redsea:utility-payments', refreshUtilityRequests)
    }
  }, [])

  const myUtilityRequests = utilityRequests
    .map(request => ({
      ...request,
      requestId: request.id,
      itemName: request.cardTitle || 'Utility payment',
      category: request.category || 'Utility payment',
      paymentLabel: 'Utility payment',
      customerName: request.customerName || request.ownerName,
      customerPhone: request.customerPhone || request.phone,
      paymentStatus: ['approved', 'receipt'].includes(request.status) ? 'approved' : 'submitted',
      status: request.status === 'request'
        ? 'pending_approval'
        : request.status === 'receipt'
          ? 'confirmed'
          : request.status,
      isUtilityPayment: true,
    }))
  const allRequests = [...requests, ...myUtilityRequests]
  const visibleRequests = allRequests.filter(request => {
    if (activeTab === 'approved') return request.paymentStatus === 'approved'
    if (activeTab === 'booked') return request.status === 'confirmed'
    return request.status !== 'confirmed' &&
      request.status !== 'cancelled' &&
      request.paymentStatus !== 'approved'
  }).sort((left, right) => new Date(right.requestedAt || 0) - new Date(left.requestedAt || 0))
  const displayedRequests = visibleRequests

  const getTabCount = tabId => {
    if (tabId === 'requests') {
      return allRequests.filter(request =>
        request.status !== 'confirmed' &&
        request.status !== 'cancelled' &&
        request.paymentStatus !== 'approved'
      ).length
    }
    if (tabId === 'approved') return allRequests.filter(request => request.paymentStatus === 'approved').length
    return allRequests.filter(request => request.status === 'confirmed').length
  }

  const downloadReceipt = request => {
    const document = new jsPDF()
    const lines = [
      'RED SEA PROPERTY',
      'Service Payment Receipt',
      '',
      `Receipt: ${request.requestId}`,
      `Customer: ${request.customerName || '—'}`,
      `Phone: ${request.customerPhone || '—'}`,
      `Service: ${request.category || 'Service'}`,
      `Payment reason: ${request.itemName || request.paymentLabel || 'Service booking'}`,
      `Payment type: ${request.paymentLabel || 'Full payment'}`,
      `Amount: ETB ${Number(request.amount || 0).toLocaleString()}`,
      `Payment method: ${request.paymentMethod || '—'}`,
      `Transaction reference: ${request.transactionReference || '—'}`,
      `Approved: ${request.approvedAt ? new Date(request.approvedAt).toLocaleString() : '—'}`,
      '',
      'This receipt confirms administrator approval of the submitted payment.',
    ]
    document.setFontSize(18)
    document.text(lines[0], 18, 22)
    document.setFontSize(15)
    document.text(lines[1], 18, 34)
    document.setFontSize(11)
    document.text(lines.slice(3), 18, 48, { lineHeightFactor: 1.65 })
    document.save(`redsea-payment-receipt-${request.requestId || 'service'}.pdf`)
  }

  return (
    <>
    <main className="service-requests-page">
      <header className="service-requests-heading">
        <span>MY ACCOUNT</span>
        <h1>Service requests &amp; bookings</h1>
        <p>Track your requests, see approved payments, and download your receipt.</p>
      </header>

      <nav className="service-requests-tabs" role="tablist" aria-label="My service requests">
        {REQUEST_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setSearchParams({ tab: tab.id })}
          >
            {tab.label}
            <span>{getTabCount(tab.id)}</span>
          </button>
        ))}
      </nav>

      {error && <p className="service-requests-error" role="alert">{error}</p>}
      {loading ? <p className="service-requests-empty">Loading your requests…</p>
        : displayedRequests.length === 0
          ? <div className="service-requests-empty">
              <span>{activeTab === 'requests' ? '🧾' : activeTab === 'approved' ? '✅' : '📅'}</span>
              <p>{activeTab === 'requests'
                ? 'You do not have any pending service requests.'
                : activeTab === 'approved'
                  ? 'No approved payment receipts yet.'
                  : 'No confirmed bookings yet.'}</p>
            </div>
          : <div className="service-request-list">
              {displayedRequests.map(request => (
                <article className="service-request-card" key={request.requestId}>
                  <div className="service-request-card-top">
                    <div>
                      <span className="service-request-category">{request.category || 'Service'}</span>
                      <h2>{request.itemName || 'Service booking'}</h2>
                    </div>
                    <span className={`service-request-badge ${request.status === 'confirmed' || request.status === 'approved' ? 'approved' : request.status === 'cancelled' ? 'cancelled' : 'pending'}`}>
                      {request.isUtilityPayment
                        ? request.status === 'confirmed' ? 'Receipt issued' : request.status === 'approved' ? 'Payment approved' : request.status === 'cancelled' ? 'Cancelled' : 'Waiting for approval'
                        : request.status === 'confirmed' ? 'Approved' : request.status === 'cancelled' ? 'Cancelled' : 'Waiting for approval'}
                    </span>
                  </div>
                  <dl>
                    <div><dt>Payment reason</dt><dd>{request.itemName || request.paymentLabel || 'Service booking'}</dd></div>
                    <div><dt>Customer</dt><dd>{request.customerName || '—'}</dd></div>
                    <div><dt>Phone</dt><dd>{request.customerPhone || '—'}</dd></div>
                    <div><dt>Amount</dt><dd>ETB {Number(request.amount || 0).toLocaleString()}</dd></div>
                    <div><dt>Payment type</dt><dd>{request.paymentLabel || 'Full payment'}</dd></div>
                    <div><dt>Method</dt><dd>{request.paymentMethod || '—'}</dd></div>
                    <div><dt>Transaction reference</dt><dd>{request.transactionReference || '—'}</dd></div>
                    <div><dt>Submitted</dt><dd>{request.requestedAt ? new Date(request.requestedAt).toLocaleString() : '—'}</dd></div>
                    {request.isUtilityPayment && request.receiptNumber && (
                      <div><dt>Receipt number</dt><dd>{request.receiptNumber}</dd></div>
                    )}
                  </dl>
                  {request.isUtilityPayment && request.receiptPdf ? (
                    <a
                      className="service-request-receipt"
                      href={request.receiptPdf}
                      download={`${request.receiptNumber || 'utility-payment-receipt'}.pdf`}
                    >
                      Download payment receipt (PDF)
                    </a>
                  ) : !request.isUtilityPayment && request.paymentStatus === 'approved' && (
                    <div className="service-request-actions">
                      {request.digitalProductAvailable && (
                        <>
                          <button
                            className="service-request-receipt service-request-open"
                            type="button"
                            disabled={previewingRequestId === request.requestId}
                            onClick={() => openDigitalProduct(request)}
                          >
                            {previewingRequestId === request.requestId ? 'Opening…' : 'Open product'}
                          </button>
                          <button
                            className="service-request-receipt service-request-download"
                            type="button"
                            disabled={downloadingRequestId === request.requestId}
                            onClick={() => downloadProduct(request)}
                          >
                            {downloadingRequestId === request.requestId ? 'Downloading…' : 'Download product'}
                          </button>
                        </>
                      )}
                      <button className="service-request-receipt" type="button" onClick={() => downloadReceipt(request)}>
                        Download payment receipt (PDF)
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>}
    </main>
    {previewFile && (
      <div className="service-product-preview-overlay" role="presentation" onMouseDown={event => {
        if (event.target === event.currentTarget) setPreviewFile(null)
      }}>
        <section className="service-product-preview-modal" role="dialog" aria-modal="true" aria-label={`Product preview: ${previewFile.filename}`}>
          <header>
            <strong title={previewFile.filename}>{previewFile.filename}</strong>
            <button type="button" aria-label="Close product preview" onClick={() => setPreviewFile(null)}>×</button>
          </header>
          <div className="service-product-preview-content">
            {previewFile.contentType.startsWith('image/')
              ? <img src={previewFile.url} alt={previewFile.filename} />
              : previewFile.contentType.startsWith('video/')
                ? <video src={previewFile.url} controls autoPlay />
                : previewFile.contentType.startsWith('audio/')
                  ? <audio src={previewFile.url} controls autoPlay />
                  : previewFile.contentType === 'application/pdf' || previewFile.filename.toLowerCase().endsWith('.pdf')
                    ? <iframe src={previewFile.url} title={`Preview ${previewFile.filename}`} />
                    : <div className="service-product-preview-fallback"><span>📄</span><p>This file type cannot be previewed in your browser. Download the file to open it.</p></div>}
          </div>
          <footer>
            <span>Payment approved · product file stays inside REDSEA</span>
            <a href={previewFile.url} download={previewFile.filename} className="service-request-receipt service-request-download">Download product</a>
          </footer>
        </section>
      </div>
    )}
    <LoginRequiredModal
      isOpen={loginPrompt.open}
      message={loginPrompt.message}
      onClose={() => setLoginPrompt({ open: false, message: '' })}
    />
    </>
  )
}

export default ServiceRequests
