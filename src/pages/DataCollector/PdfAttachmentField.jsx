import { useEffect, useRef, useState } from 'react'

const MAX_PDF_BYTES = 4 * 1024 * 1024

export function readPdfFile(file) {
  return new Promise((resolve, reject) => {
    if (file.type !== 'application/pdf') {
      reject(new Error('Select a PDF file.'))
      return
    }
    if (file.size > MAX_PDF_BYTES) {
      reject(new Error('PDF files must be 4 MB or smaller.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the selected PDF.'))
    reader.readAsDataURL(file)
  })
}

export default function PdfAttachmentField({
  label,
  value,
  onChange,
  disabled = false,
  registrationId,
  documentType = 'bank-receipt',
}) {
  const [error, setError] = useState('')
  const [viewing, setViewing] = useState(false)
  const locallyChanged = useRef(false)
  const lastRegistrationId = useRef(null)

  useEffect(() => {
    if (lastRegistrationId.current !== registrationId) {
      lastRegistrationId.current = registrationId || null
      locallyChanged.current = false
    }
    if (!registrationId || value || locallyChanged.current) return
    let cancelled = false
    import('../../services/api.js').then(({ dataRegistrationAPI }) =>
      documentType === 'owner-receipt'
        ? dataRegistrationAPI.getOwnerReceiptDocument(registrationId)
        : dataRegistrationAPI.getBankReceiptDocument(registrationId)
    ).then(response => {
      if (!cancelled && response?.data && !locallyChanged.current) onChange(response.data)
    }).catch(loadError => {
      if (!cancelled) setError(`Could not load bank receipt: ${loadError.message}`)
    })
    return () => { cancelled = true }
  }, [documentType, registrationId, value])

  const handleFileChange = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      locallyChanged.current = true
      await onChange(await readPdfFile(file))
      setError('')
    } catch (uploadError) {
      setError(uploadError.message)
    }
  }

  const download = () => {
    const link = document.createElement('a')
    link.href = value
    link.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="ebc-field-group pdf-attachment-field">
      <label className="ebc-label">{label} <span className="ebc-label-optional">Optional PDF · max 4 MB</span></label>
      <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} disabled={disabled} />
      {value && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className="ebc-btn" onClick={() => setViewing(true)}>View PDF</button>
          <button type="button" className="ebc-btn" onClick={download}>Download PDF</button>
          {!disabled && <button type="button" className="ebc-btn clear" onClick={async () => { locallyChanged.current = true; await onChange(''); setError('') }}>Remove PDF</button>}
        </div>
      )}
      {error && <div className="ebc-status-pill error" role="alert">{error}</div>}
      {viewing && value && (
        <div className="pdf-preview-overlay" role="dialog" aria-modal="true" aria-label={`View ${label}`}>
          <div className="pdf-preview-dialog">
            <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{label}</strong>
              <button type="button" className="ebc-btn clear" onClick={() => setViewing(false)}>Close</button>
            </div>
            <iframe title={label} src={`${value}#toolbar=0&navpanes=0`} style={{ border: 0, width: '100%', flex: 1 }} />
          </div>
        </div>
      )}
    </div>
  )
}
