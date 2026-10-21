import { useState } from 'react'
import { PRODUCT_CATEGORIES } from '../utils/productCategories'
import './ServiceProductAdderModal.css'

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'Other category',
  organizationName: '',
  ownerName: '',
  location: '',
  city: '',
  country: '',
  size: '',
  quantity: '',
  digitalProduct: false,
  downloadUrl: '',
  color: '',
  price: '',
  compareAmount: '',
  image: '',
  images: [],
  serviceChargeEnabled: false,
  serviceChargeAmount: '',
  firstPaymentEnabled: false,
  firstPaymentAmount: '',
  fullPaymentEnabled: true,
  fullPaymentAmount: '',
  fullPaymentRequired: false,
  deliveryEnabled: false,
  deliveryFee: '',
}

const PAYMENT_FIELDS = [
  { enabled: 'serviceChargeEnabled', amount: 'serviceChargeAmount', label: 'Service charge' },
  { enabled: 'firstPaymentEnabled', amount: 'firstPaymentAmount', label: 'First payment' },
  { enabled: 'fullPaymentEnabled', amount: 'fullPaymentAmount', label: 'Full payment' },
]

const DIGITAL_PRODUCT_CATEGORIES = new Set([
  'E-book',
  'Digital file',
  'Software',
  'Online course',
  'Other digital product',
])

const readResizedImage = file => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error('Could not read the selected image.'))
  reader.onload = () => {
    const image = new Image()
    image.onerror = () => reject(new Error('The selected file is not a valid image.'))
    image.onload = () => {
      const scale = Math.min(1, 1000 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('Could not prepare the selected image.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    image.src = String(reader.result)
  }
  reader.readAsDataURL(file)
})

function ServiceProductAdderModal({ initialProduct, initialValues = {}, initialDigitalProduct = false, serviceCategories = [], onClose, onSave }) {
  const [form, setForm] = useState(() => {
    const digitalProduct = Boolean(initialDigitalProduct || initialProduct?.digitalProduct)
    const savedPayments = initialProduct?.paymentOptions || {}
    return {
      ...EMPTY_FORM,
      ...(initialProduct
        ? { ...initialProduct, name: initialProduct.name || initialProduct.title || '' }
        : initialValues),
      ...(initialProduct ? {
        serviceChargeEnabled: Boolean(savedPayments.serviceCharge?.enabled),
        serviceChargeAmount: savedPayments.serviceCharge?.amount ?? '',
        firstPaymentEnabled: Boolean(savedPayments.firstPayment?.enabled),
        firstPaymentAmount: savedPayments.firstPayment?.amount ?? '',
        fullPaymentEnabled: savedPayments.fullPayment?.enabled !== false,
        fullPaymentAmount: savedPayments.fullPayment?.amount ?? '',
        fullPaymentRequired: Boolean(savedPayments.fullPayment?.required),
      } : {}),
      ...(digitalProduct ? {
        digitalProduct: true,
        serviceChargeEnabled: false,
        firstPaymentEnabled: false,
        fullPaymentEnabled: true,
        fullPaymentRequired: true,
      } : {}),
    }
  })
  const [error, setError] = useState('')
  const [imageLoading, setImageLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }))
    setError('')
  }

  const updateProductType = digitalProduct => {
    setForm(current => ({
      ...current,
      digitalProduct,
      serviceChargeEnabled: digitalProduct ? false : current.serviceChargeEnabled,
      firstPaymentEnabled: digitalProduct ? false : current.firstPaymentEnabled,
      fullPaymentEnabled: digitalProduct ? true : current.fullPaymentEnabled,
      fullPaymentRequired: digitalProduct ? true : false,
      deliveryEnabled: digitalProduct ? false : current.deliveryEnabled,
      deliveryFee: digitalProduct ? '' : current.deliveryFee,
      category: digitalProduct
        ? DIGITAL_PRODUCT_CATEGORIES.has(current.category) ? current.category : 'Digital file'
        : DIGITAL_PRODUCT_CATEGORIES.has(current.category) ? 'Other category' : current.category,
    }))
    setError('')
  }

  const handleImage = async event => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    if (files.some(file => !file.type.startsWith('image/'))) {
      setError('Choose image files only.')
      event.target.value = ''
      return
    }
    const existingImages = form.images?.length ? form.images : form.image ? [form.image] : []
    if (existingImages.length + files.length > 5) {
      setError('You can add up to five product images.')
      event.target.value = ''
      return
    }
    setImageLoading(true)
    try {
      const newImages = await Promise.all(files.map(readResizedImage))
      const images = [...existingImages, ...newImages]
      setForm(current => ({ ...current, images, image: images[0] || '' }))
      setError('')
    } catch (imageError) {
      setError(imageError.message)
    } finally {
      setImageLoading(false)
      event.target.value = ''
    }
  }

  const removeImage = imageIndex => {
    const images = (form.images?.length ? form.images : form.image ? [form.image] : [])
      .filter((_, index) => index !== imageIndex)
    setForm(current => ({ ...current, images, image: images[0] || '' }))
  }

  const submit = async event => {
    event.preventDefault()
    if (!form.name.trim()) {
      setError('Product or service name is required.')
      return
    }
    if (!form.organizationName.trim() && !form.ownerName.trim()) {
      setError('Enter an organization name or an owner / provider name.')
      return
    }
    if (!form.price || Number(form.price) <= 0) {
      setError('Enter a valid product or service price.')
      return
    }
    if (form.digitalProduct) {
      try {
        const downloadUrl = new URL(form.downloadUrl.trim())
        if (downloadUrl.protocol !== 'https:') throw new Error()
      } catch {
        setError('Enter a valid HTTPS download link from Google Drive, Dropbox, or OneDrive.')
        return
      }
    }

    const enabledPayments = (form.digitalProduct
      ? PAYMENT_FIELDS.filter(field => field.enabled === 'fullPaymentEnabled')
      : PAYMENT_FIELDS).filter(field => form[field.enabled])
    if (enabledPayments.length === 0) {
      setError('Enable at least one payment option.')
      return
    }
    for (const field of enabledPayments) {
      const rawAmount = field.amount === 'fullPaymentAmount' && !form[field.amount]
        ? form.price
        : form[field.amount]
      if (!rawAmount || Number(rawAmount) <= 0) {
        setError(`Enter a valid amount for ${field.label.toLowerCase()}.`)
        return
      }
    }
    if (form.fullPaymentRequired && !form.fullPaymentEnabled) {
      setError('Enable full payment before making it required.')
      return
    }
    if (form.deliveryEnabled && !form.digitalProduct &&
        (!Number.isFinite(Number(form.deliveryFee)) || Number(form.deliveryFee) < 0)) {
      setError('Enter a valid delivery fee of zero or more ETB.')
      return
    }

    setSaving(true)
    try {
      await onSave({
        ...form,
        color: form.digitalProduct ? '' : form.color,
        id: initialProduct?.id || `service-${Date.now()}`,
        title: form.name.trim(),
        description: form.description.trim(),
        deliveryEnabled: !form.digitalProduct && Boolean(form.deliveryEnabled),
        deliveryFee: !form.digitalProduct && form.deliveryEnabled ? Number(form.deliveryFee) : 0,
        price: Number(form.price),
        compareAmount: form.compareAmount === '' ? null : Number(form.compareAmount),
        quantity: form.quantity === '' ? null : Number(form.quantity),
        paymentOptions: {
          serviceCharge: {
            enabled: !form.digitalProduct && form.serviceChargeEnabled,
            amount: Number(form.serviceChargeAmount) || 0,
          },
          firstPayment: {
            enabled: !form.digitalProduct && form.firstPaymentEnabled,
            amount: Number(form.firstPaymentAmount) || 0,
          },
          fullPayment: {
            enabled: form.digitalProduct || form.fullPaymentEnabled,
            amount: Number(form.fullPaymentAmount || form.price) || 0,
            required: form.digitalProduct || form.fullPaymentEnabled && form.fullPaymentRequired,
          },
        },
        serviceProduct: true,
      })
    } catch (saveError) {
      setError(saveError.message || 'Could not save the service product.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="service-product-modal-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="service-product-modal" role="dialog" aria-modal="true" aria-labelledby="service-product-modal-title">
        <div className="service-product-modal-header">
          <div>
            <span className="service-product-modal-kicker">{form.digitalProduct ? 'DIGITAL PRODUCT' : 'SERVICE CATALOG'}</span>
            <h2 id="service-product-modal-title">
              {initialProduct
                ? form.digitalProduct ? 'Edit digital product' : 'Edit service product'
                : form.digitalProduct ? 'Add digital product' : 'Add service product'}
            </h2>
          </div>
          <button type="button" className="service-product-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {error && <p className="service-product-modal-error">{error}</p>}
        <form onSubmit={submit}>
          <div className="service-product-form-grid">
            <div className="service-product-image-field">
              <span>Product images (up to 5)</span>
              {(form.images?.length ? form.images : form.image ? [form.image] : []).length > 0
                ? <div className="service-product-image-previews">
                    {(form.images?.length ? form.images : [form.image]).map((image, index) => (
                      <div className="service-product-image-preview" key={`${index}-${image.slice(0, 24)}`}>
                        <img src={image} alt={`Product preview ${index + 1}`} />
                        <button type="button" onClick={() => removeImage(index)} aria-label={`Remove image ${index + 1}`}>×</button>
                      </div>
                    ))}
                  </div>
                : <span className="service-product-image-placeholder">＋ Select image</span>}
              <input type="file" accept="image/*" multiple onChange={handleImage} />
            </div>
            <div className="service-product-form-fields">
              {serviceCategories.length > 0 && (
                <label>Service section *
                  <select required value={form.serviceKey || serviceCategories[0].storageKey} onChange={event => update('serviceKey', event.target.value)}>
                    {serviceCategories.map(item => <option key={item.storageKey} value={item.storageKey}>{item.name}</option>)}
                  </select>
                </label>
              )}
              <label>Product or service name *
                <input required value={form.name} onChange={event => update('name', event.target.value)} />
              </label>
              <label>Description
                <textarea rows="3" maxLength="2000" value={form.description} onChange={event => update('description', event.target.value)} placeholder="Describe the product or service for customers." />
              </label>
              <label>Category *
                <select required value={form.category} onChange={event => update('category', event.target.value)}>
                  {!PRODUCT_CATEGORIES.includes(form.category) && form.category && (
                    <option value={form.category}>{form.category}</option>
                  )}
                  {PRODUCT_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label>Organization name
                <input value={form.organizationName} onChange={event => update('organizationName', event.target.value)} />
              </label>
              <label>Owner / provider name
                <input value={form.ownerName} onChange={event => update('ownerName', event.target.value)} />
              </label>
              <div className="service-product-location-fields">
                <label>Location / area
                  <input value={form.location} onChange={event => update('location', event.target.value)} placeholder="Neighborhood, address, or landmark" />
                </label>
                <label>City
                  <input value={form.city} onChange={event => update('city', event.target.value)} />
                </label>
                <label>Country
                  <input value={form.country} onChange={event => update('country', event.target.value)} />
                </label>
              </div>
              <div className="service-product-location-fields">
                <label>Size / dimensions (optional)
                  <input value={form.size} onChange={event => update('size', event.target.value)} placeholder="e.g. Large, 42, or 3 × 4 m" />
                </label>
              </div>
              <div className="service-product-location-fields">
                <label>Price (ETB) *
                  <input required type="number" min="0.01" step="0.01" value={form.price} onChange={event => update('price', event.target.value)} />
                </label>
                <label>Quantity (optional)
                  <input type="number" min="0" step="1" value={form.quantity} onChange={event => update('quantity', event.target.value)} />
                </label>
              </div>
              <label className="service-product-digital-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(form.digitalProduct)}
                  onChange={event => updateProductType(event.target.checked)}
                />
                <span className="service-product-switch-track" />
                {form.digitalProduct ? 'Digital product' : 'Product'}
              </label>
              {form.digitalProduct && (
                <label>Download link (Google Drive, Dropbox, or OneDrive) *
                  <input
                    required
                    type="url"
                    inputMode="url"
                    placeholder="https://drive.google.com/file/d/..."
                    value={form.downloadUrl}
                    onChange={event => update('downloadUrl', event.target.value)}
                  />
                  <small>The file is delivered on REDSEA after payment approval; customers will not see this link.</small>
                </label>
              )}
              {!form.digitalProduct && (
                <label className="service-product-color-field">Product color (optional)
                  <input
                    type="color"
                    value={form.color || '#ffffff'}
                    aria-label="Choose product color"
                    onChange={event => update('color', event.target.value)}
                  />
                </label>
              )}
              {!form.digitalProduct && (
                <fieldset className="service-product-delivery-settings">
                  <legend>Delivery option</legend>
                  <label className="service-product-switch">
                    <input
                      type="checkbox"
                      checked={Boolean(form.deliveryEnabled)}
                      onChange={event => update('deliveryEnabled', event.target.checked)}
                    />
                    <span className="service-product-switch-track" />
                    <span>Offer delivery</span>
                  </label>
                  {form.deliveryEnabled && (
                    <>
                      <label>Delivery fee (ETB)
                        <input type="number" min="0" step="0.01" required value={form.deliveryFee} onChange={event => update('deliveryFee', event.target.value)} />
                      </label>
                      <small>Customers pay this delivery fee separately when they receive the product. It is not included in the booking payment.</small>
                    </>
                  )}
                </fieldset>
              )}
              <label>Compare amount (ETB) — optional
                <input type="number" min="0" step="0.01" placeholder="Shown in red on the customer card" value={form.compareAmount} onChange={event => update('compareAmount', event.target.value)} />
              </label>
            </div>
          </div>

          <fieldset className="service-product-payment-settings">
            <legend>Payment options</legend>
            <p>Choose the payment options customers can select when booking.</p>
            {(form.digitalProduct ? PAYMENT_FIELDS.filter(field => field.enabled === 'fullPaymentEnabled') : PAYMENT_FIELDS).map(field => (
              <div className="service-product-payment-setting" key={field.enabled}>
                <label className="service-product-switch">
                  <input
                    type="checkbox"
                    checked={form[field.enabled]}
                    disabled={form.digitalProduct}
                    onChange={event => update(field.enabled, event.target.checked)}
                  />
                  <span className="service-product-switch-track" />
                  <span>{field.label}</span>
                </label>
                {form[field.enabled] && (
                  <input
                    aria-label={`${field.label} amount`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder={field.amount === 'fullPaymentAmount' ? `Default: ETB ${form.price || 0}` : 'Amount in ETB'}
                    value={form[field.amount]}
                    onChange={event => update(field.amount, event.target.value)}
                  />
                )}
              </div>
            ))}
            <label className="service-product-required-full">
              <input
                type="checkbox"
                checked={form.fullPaymentRequired}
                disabled={!form.fullPaymentEnabled || form.digitalProduct}
                onChange={event => update('fullPaymentRequired', event.target.checked)}
              />
              {form.digitalProduct ? 'Require full payment before download' : 'Require full payment to book'}
            </label>
          </fieldset>

          <div className="service-product-modal-actions">
            <button type="button" className="service-product-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="service-product-submit" disabled={imageLoading || saving}>
              {imageLoading
                ? 'Preparing image…'
                : saving
                  ? 'Saving…'
                  : initialProduct
                    ? 'Save changes'
                    : form.digitalProduct ? 'Add digital product' : 'Add product'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default ServiceProductAdderModal
