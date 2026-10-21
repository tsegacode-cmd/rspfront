import { useEffect, useState } from 'react'
import CardShareActions from './CardShareActions'
import LoginRequiredModal from './LoginRequiredModal'
import './ServiceProductGrid.css'

function ServiceProductGrid({
  items,
  emptyMessage,
  accent,
  onBook,
  onEdit,
  onDelete,
}) {
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedImage, setSelectedImage] = useState('')
  const [zoomed, setZoomed] = useState(false)
  const [loginPrompt, setLoginPrompt] = useState({ open: false, message: '' })
  const getPrimaryImage = item => item.image || item.images?.[0] || ''
  const openDetails = item => {
    setSelectedItem(item)
    setSelectedImage(getPrimaryImage(item))
  }

  useEffect(() => {
    if (selectedItem) return
    const params = new URLSearchParams(window.location.search)
    const sharedProductId = params.get('product') || params.get('promotionProduct')
    if (!sharedProductId) return

    const sharedItem = items.find(item => String(item.id) === sharedProductId)
    if (sharedItem) {
      setSelectedItem(sharedItem)
      setSelectedImage(getPrimaryImage(sharedItem))
    }
  }, [items, selectedItem])

  const closeDetails = () => {
    setSelectedItem(null)
    setZoomed(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('product')
    url.searchParams.delete('promotionProduct')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }

  const requireLogin = message => {
    if (localStorage.getItem('authToken') && localStorage.getItem('userData')) return true
    setLoginPrompt({ open: true, message: message || 'Please log in first.' })
    return false
  }

  const startBooking = item => {
    const isDigitalProduct = Boolean(item.digitalProduct)
    if (!requireLogin(isDigitalProduct
      ? 'Please log in to download this product.'
      : 'Please log in to book this service.')) return
    onBook(item)
  }

  if (!items.length) {
    return <div className="service-product-empty">{emptyMessage}</div>
  }

  return (
    <>
    <div className="service-product-grid">
      {items.map(item => (
        <article
          className="service-product-card"
          key={item.id}
          style={{ '--service-accent': accent }}
          tabIndex={0}
          role="button"
          aria-label={`View details for ${item.title}`}
          onClick={() => {
            openDetails(item)
          }}
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openDetails(item)
            }
          }}
        >
          {getPrimaryImage(item) && (
            <div className="service-product-card-gallery">
              <img className="service-product-image" src={getPrimaryImage(item)} alt={item.title} />
              {item.images?.length > 1 && (
                <div className="service-product-card-thumbnails">
                  {item.images.slice(1).map((image, index) => (
                    <img key={`${item.id}-image-${index}`} src={image} alt={`${item.title} image ${index + 2}`} />
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="service-product-card-top">
            <span className="service-product-icon">{item.icon || '🏷️'}</span>
            <span className="service-product-card-top-right">
              {item.boosted && <span className="service-product-boosted-badge">Boosted</span>}
              {item.discountPercent ? (
                <span className="service-product-discount-badge">{item.discountPercent}% OFF</span>
              ) : null}
              <span className="service-product-status">{item.statusLabel || item.status || 'Available'}</span>
            </span>
          </div>
          <h3>{item.title}</h3>
          {item.subtitle && <p className="service-product-subtitle">{item.subtitle}</p>}
          <div className="service-product-details">
            {(item.details || []).filter(Boolean).map((detail, index) => (
              <span key={`${item.id}-${index}`}>{detail}</span>
            ))}
          </div>
          <div className="service-product-price">
            <small>{item.priceLabel || 'Price'}</small>
            <strong>{item.price || 'Contact for price'}</strong>
          </div>
          {item.productUrl && <a className="service-product-external-link" href={item.productUrl} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>View linked product →</a>}
          {item.compareAmount !== null && item.compareAmount !== undefined && item.compareAmount !== '' && (
            <p className="service-product-compare-amount">
              ETB {Number(item.compareAmount || 0).toLocaleString()}
            </p>
          )}
          {item.paymentMethod && (
            <p className="service-product-payment">Payment: {item.paymentMethod} (pending)</p>
          )}
          <div className="service-product-actions">
            <CardShareActions
              url={item.shareUrl || window.location.href}
              title={item.title || 'Service'}
              className="service-product-share"
            />
            <button type="button" className="service-product-book" onClick={event => {
              event.stopPropagation()
              startBooking(item)
            }}>
              {item.digitalProduct ? 'Download' : 'Book'}
            </button>
            {!item.catalog && onEdit && <button type="button" className="service-product-edit" onClick={event => { event.stopPropagation(); onEdit(item) }}>Edit</button>}
            {!item.catalog && onDelete && <button type="button" className="service-product-delete" onClick={event => { event.stopPropagation(); onDelete(item.id) }}>Delete</button>}
          </div>
        </article>
      ))}
      {selectedItem && (
        <div className="service-product-detail-overlay" onMouseDown={event => {
          if (event.target === event.currentTarget) {
            closeDetails()
          }
        }}>
          <section className="service-product-detail-modal" style={{ '--service-accent': accent }} role="dialog" aria-modal="true" aria-labelledby="service-product-detail-title">
            <button type="button" className="service-product-detail-close" aria-label="Close product details" onClick={closeDetails}>×</button>
            <div className="service-product-detail-layout">
              <div className="service-product-detail-gallery">
                {selectedImage
                  ? <img
                      className={`service-product-detail-image ${zoomed ? 'zoomed' : ''}`}
                      src={selectedImage}
                      alt={selectedItem.title}
                      onClick={() => setZoomed(current => !current)}
                    />
                  : <div className="service-product-detail-placeholder">{selectedItem.icon || '🏷️'}</div>}
                {(selectedItem.images?.length > 1) && (
                  <div className="service-product-detail-thumbnails">
                    {selectedItem.images.map((image, index) => (
                      <button
                        key={`${selectedItem.id}-detail-${index}`}
                        type="button"
                        className={selectedImage === image ? 'active' : ''}
                        onClick={() => { setSelectedImage(image); setZoomed(false) }}
                      >
                        <img src={image} alt={`${selectedItem.title} ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
                {selectedImage && <span className="service-product-zoom-hint">Click image to zoom</span>}
              </div>
              <div className="service-product-detail-copy">
                <span className="service-product-status">{selectedItem.statusLabel || selectedItem.status || 'Available'}</span>
                {selectedItem.boosted && <span className="service-product-boosted-badge">Boosted</span>}
                <h2 id="service-product-detail-title">{selectedItem.title}</h2>
                {selectedItem.subtitle && <p className="service-product-detail-subtitle">{selectedItem.subtitle}</p>}
                {selectedItem.description && <p className="service-product-detail-description-text">{selectedItem.description}</p>}
                {selectedItem.deliveryEnabled && !selectedItem.digitalProduct && (
                  <p className="service-product-delivery-note">
                    Delivery is optional. An additional ETB {Number(selectedItem.deliveryFee || 0).toLocaleString()} delivery fee is payable when you receive the product and is not included in the booking payment.
                  </p>
                )}
                <strong className="service-product-detail-price">{selectedItem.price || 'Contact for price'}</strong>
                <CardShareActions
                  url={selectedItem.shareUrl || window.location.href}
                  title={selectedItem.title || 'Service'}
                />
                {selectedItem.productUrl && <a className="service-product-external-link" href={selectedItem.productUrl} target="_blank" rel="noreferrer">Open linked product →</a>}
                {selectedItem.discountPercent ? (
                  <span className="service-product-discount-badge service-product-discount-badge-lg">{selectedItem.discountPercent}% OFF</span>
                ) : null}
                {selectedItem.compareAmount !== null && selectedItem.compareAmount !== undefined && selectedItem.compareAmount !== '' && (
                  <strong className="service-product-compare-amount" style={{ fontSize: '1rem' }}>
                    ETB {Number(selectedItem.compareAmount || 0).toLocaleString()}
                  </strong>
                )}
                {selectedItem.paymentOptions && (
                  <div className="service-product-detail-payment">
                    {[
                      ['serviceCharge', 'Service charge'],
                      ['firstPayment', 'First payment'],
                      ['fullPayment', 'Full payment'],
                    ].filter(([key]) => selectedItem.paymentOptions[key]?.enabled)
                      .map(([key, label]) => (
                        <span key={key}>
                          {label}: ETB {Number(selectedItem.paymentOptions[key].amount || 0).toLocaleString()}
                          {key === 'fullPayment' && selectedItem.paymentOptions[key].required ? ' (required)' : ''}
                        </span>
                      ))}
                  </div>
                )}
                <div className="service-product-detail-description">
                  {(selectedItem.details || []).filter(Boolean).map((detail, index) => (
                    <p key={`${selectedItem.id}-detail-${index}`}>{detail}</p>
                  ))}
                </div>
                <button type="button" className="service-product-detail-book" onClick={() => {
                  if (!requireLogin(selectedItem.digitalProduct
                    ? 'Please log in to download this product.'
                    : 'Please log in to book this service.')) return
                  const item = selectedItem
                  setSelectedItem(null)
                  setZoomed(false)
                  onBook(item)
                }}>
                  {selectedItem.digitalProduct ? 'Download · pay securely' : 'Book this service'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
    <LoginRequiredModal
      isOpen={loginPrompt.open}
      message={loginPrompt.message}
      onClose={() => setLoginPrompt({ open: false, message: '' })}
    />
    </>
  )
}

export default ServiceProductGrid
