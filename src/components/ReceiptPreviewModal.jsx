import './ReceiptPreviewModal.css'

function ReceiptPreviewModal({ title = 'Receipt', image, file, loading = false, error = '', onClose }) {
  const attachment = file || image
  const isPdf = attachment?.startsWith('data:application/pdf')

  return (
    <div className="receipt-preview-backdrop" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="receipt-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
        <header>
          <h2 id="receipt-preview-title">{title}</h2>
          <button type="button" aria-label="Close receipt" onClick={onClose}>×</button>
        </header>
        {loading ? <p role="status">Loading receipt…</p> : null}
        {error && <p className="receipt-preview-error" role="alert">{error}</p>}
        {attachment && (isPdf ? (
          <>
            <iframe className="receipt-preview-pdf" src={attachment} title={title} />
            <a className="receipt-preview-download" href={attachment} download="receipt.pdf">
              Download PDF
            </a>
          </>
        ) : <img src={attachment} alt={title} />)}
      </section>
    </div>
  )
}

export default ReceiptPreviewModal
