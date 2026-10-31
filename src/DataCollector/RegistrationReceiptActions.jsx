import { useState } from 'react'

export default function RegistrationReceiptActions({ registration, receiptType = 'all' }) {
  const [activeReceipt, setActiveReceipt] = useState(null)
  const [loadingType, setLoadingType] = useState('')
  const [error, setError] = useState('')

  const loadReceipt = async (type, label) => {
    const registrationId = registration?._id || registration?.id
    if (!registrationId) {
      throw new Error('This registration has no database ID.')
    }

    const { dataRegistrationAPI } = await import('../../services/api.js')
    const response = type === 'owner'
      ? await dataRegistrationAPI.getOwnerReceiptDocument(registrationId)
      : await dataRegistrationAPI.getBankReceiptDocument(registrationId)
    const pdfData = response?.data
    if (typeof pdfData !== 'string' || !pdfData.startsWith('data:application/pdf;base64,')) {
      throw new Error(`${label} PDF was not found in the database.`)
    }
    return pdfData
  }

  const downloadPdf = (pdfData, type) => {
    const base64 = pdfData.split(',')[1]
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const link = document.createElement('a')
    const receiptId = String(registration.receipt_no || registration._id || registration.id)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    link.href = url
    link.download = `${type}-receipt-${receiptId}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handleReceiptAction = async (type, label, action) => {
    setLoadingType(`${type}-${action}`)
    setError('')
    try {
      const pdfData = await loadReceipt(type, label)
      if (action === 'view') setActiveReceipt({ label, pdfData, type })
      else downloadPdf(pdfData, type)
    } catch (loadError) {
      console.error(`Could not ${action} ${label} PDF for registration:`, loadError)
      setError(loadError.message || `Could not ${action} ${label} PDF.`)
    } finally {
      setLoadingType('')
    }
  }

  const downloadReceipt = () => {
    if (!activeReceipt) return
    downloadPdf(activeReceipt.pdfData, activeReceipt.type)
  }

  const bankReceiptButtons = hasBankReceipt => hasBankReceipt && (
    <>
      <button
        type="button"
        className="ebc-btn"
        disabled={Boolean(loadingType)}
        onClick={() => handleReceiptAction('bank', 'Bank receipt', 'view')}
      >
        {loadingType === 'bank-view' ? 'Loading…' : 'View bank PDF'}
      </button>
      <button
        type="button"
        className="ebc-btn"
        disabled={Boolean(loadingType)}
        onClick={() => handleReceiptAction('bank', 'Bank receipt', 'download')}
      >
        {loadingType === 'bank-download' ? 'Loading…' : 'Download bank PDF'}
      </button>
    </>
  )

  const ownerReceiptButtons = hasOwnerReceipt => hasOwnerReceipt && (
    <>
      <button
        type="button"
        className="ebc-btn"
        disabled={Boolean(loadingType)}
        onClick={() => handleReceiptAction('owner', 'Project owner receipt', 'view')}
      >
        {loadingType === 'owner-view' ? 'Loading…' : 'View owner PDF'}
      </button>
      <button
        type="button"
        className="ebc-btn"
        disabled={Boolean(loadingType)}
        onClick={() => handleReceiptAction('owner', 'Project owner receipt', 'download')}
      >
        {loadingType === 'owner-download' ? 'Loading…' : 'Download owner PDF'}
      </button>
    </>
  )

  const hasBankReceipt = Boolean(registration?.has_bank_receipt)
  const hasOwnerReceipt = Boolean(registration?.has_owner_receipt)

  return (
    <div className="registration-receipt-actions" onClick={event => event.stopPropagation()}>
      {(receiptType === 'all' || receiptType === 'bank') && bankReceiptButtons(hasBankReceipt)}
      {(receiptType === 'all' || receiptType === 'owner') && ownerReceiptButtons(hasOwnerReceipt)}
      {((receiptType === 'bank' && !hasBankReceipt) ||
        (receiptType === 'owner' && !hasOwnerReceipt) ||
        (receiptType === 'all' && !hasBankReceipt && !hasOwnerReceipt)) && <span>—</span>}
      {error && <span className="registration-receipt-error" role="alert">{error}</span>}
      {activeReceipt && (
        <div
          className="registration-receipt-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={activeReceipt.label}
          onClick={() => setActiveReceipt(null)}
        >
          <div className="registration-receipt-dialog" onClick={event => event.stopPropagation()}>
            <header>
              <strong>{activeReceipt.label}</strong>
              <div>
                <button type="button" className="ebc-btn" onClick={downloadReceipt}>Download PDF</button>
                <button type="button" className="ebc-btn clear" onClick={() => setActiveReceipt(null)}>Close</button>
              </div>
            </header>
            <iframe title={activeReceipt.label} src={activeReceipt.pdfData} />
          </div>
        </div>
      )}
    </div>
  )
}
