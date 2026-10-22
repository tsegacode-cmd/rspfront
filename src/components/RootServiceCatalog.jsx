import { useEffect, useState } from 'react'
import { rootAPI } from '../services/api'
import Pagination, { getPageItems, PAGE_SIZE } from './Pagination'
import ServiceProductAdderModal from './ServiceProductAdderModal'
import CardShareActions from './CardShareActions'
import { getServiceProductUrl } from '../utils/serviceProductLinks'
import './RootServiceCatalog.css'

const SERVICE_CATEGORIES = [
  { id: 'broker-house', storageKey: 'broker-house', icon: '🏠', name: 'Broker & House', description: 'Property listings, rentals and sales' },
  { id: 'partnership', storageKey: 'create-partnership', icon: '🤝', name: 'Create Partnership', description: 'Brokerage and property partnership services' },
  { id: 'room-booking', storageKey: 'room-booking', icon: '🛏️', name: 'Room Booking', description: 'Guest rooms and accommodation' },
  { id: 'logistics', storageKey: 'logistics', icon: '🚗', name: 'Logistics', description: 'Vehicle rental and transport services' },
  { id: 'movable-services', storageKey: 'movable-services', icon: '📦', name: 'Big Service', description: 'Moving and movable-property services' },
]
const DIGITAL_PRODUCTS_TAB = 'digital-products'

function RootServiceCatalog() {
  const [activeCategory, setActiveCategory] = useState(SERVICE_CATEGORIES[0].id)
  const [lastServiceCategory, setLastServiceCategory] = useState(SERVICE_CATEGORIES[0].storageKey)
  const [products, setProducts] = useState([])
  const [editingProduct, setEditingProduct] = useState(undefined)
  const [error, setError] = useState('')
  const [productPage, setProductPage] = useState(0)
  const [platformFeePercent, setPlatformFeePercent] = useState('')
  const [savingFee, setSavingFee] = useState(false)
  const category = SERVICE_CATEGORIES.find(item => item.id === activeCategory) || SERVICE_CATEGORIES[0]
  const showingDigitalProducts = activeCategory === DIGITAL_PRODUCTS_TAB
  const visibleProducts = showingDigitalProducts ? products.filter(product => product.digitalProduct) : products.filter(product => product.serviceKey === category.storageKey)
  const storageKey = `service_products_${category.storageKey}`
  const safeProductPage = Math.min(productPage, Math.max(0, Math.ceil(visibleProducts.length / PAGE_SIZE) - 1))

  useEffect(() => {
    rootAPI.getMarketplaceSettings()
      .then(response => setPlatformFeePercent(String(response.data.platformServiceChargePercent ?? 0)))
      .catch(loadError => setError(`Could not load marketplace settings: ${loadError.message}`))
  }, [])

  useEffect(() => {
    let active = true
    const loadProducts = () => {
      rootAPI.getServiceProducts()
        .then(async response => {
          if (!active) return
          let allProducts = response.data
          let productsForCategory = response.data.filter(product => product.serviceKey === category.storageKey)
          if (activeCategory !== DIGITAL_PRODUCTS_TAB && productsForCategory.length === 0) {
            const legacy = JSON.parse(localStorage.getItem(storageKey) || '[]')
            if (!Array.isArray(legacy)) throw new Error(`Saved ${category.name} products have an invalid format.`)
            for (const product of legacy) {
              await rootAPI.saveServiceProduct(category.storageKey, product)
            }
            if (legacy.length) {
              const refreshed = await rootAPI.getServiceProducts()
              allProducts = refreshed.data
              productsForCategory = refreshed.data.filter(product => product.serviceKey === category.storageKey)
            }
          }
          if (active) {
            setProducts(allProducts)
            setError('')
          }
        })
        .catch(loadError => {
          if (active) {
            setProducts([])
            setError(`Could not load ${category.name} products: ${loadError.message}`)
          }
        })
    }

    loadProducts()
    window.addEventListener('storage', loadProducts)
    return () => {
      active = false
      window.removeEventListener('storage', loadProducts)
    }
  }, [storageKey, category.name, category.storageKey, activeCategory])

  const saveProduct = async product => {
    try {
      const existing = products.find(item => item.id === product.id)
      const savedProduct = {
        ...product,
        category: product.category || 'Other category',
        published: existing ? existing.published !== false : false,
      }
      const serviceKey = product.serviceKey || category.storageKey
      await rootAPI.saveServiceProduct(serviceKey, savedProduct)
      const response = await rootAPI.getServiceProducts()
      setProducts(response.data)
      setError('')
      setEditingProduct(undefined)
    } catch (saveError) {
      setError(`Could not save ${showingDigitalProducts ? 'digital' : category.name} products: ${saveError.message}`)
      throw saveError
    }
  }

  const savePlatformFee = async event => {
    event.preventDefault()
    setSavingFee(true)
    setError('')
    try {
      const response = await rootAPI.saveMarketplaceSettings({
        platformServiceChargePercent: Number(platformFeePercent),
      })
      setPlatformFeePercent(String(response.data.platformServiceChargePercent))
    } catch (saveError) {
      setError(`Could not save marketplace service charge: ${saveError.message}`)
    } finally {
      setSavingFee(false)
    }
  }

  const togglePublished = async product => {
    try {
      await rootAPI.updateServiceProduct(product.id, { published: product.published === false })
      setProducts(current => current.map(item => item.id === product.id
        ? { ...item, published: product.published === false }
        : item))
      setError('')
    } catch (updateError) {
      setError(`Could not update ${product.digitalProduct ? 'digital' : category.name} product: ${updateError.message}`)
    }
  }

  const toggleBoosted = async product => {
    try {
      await rootAPI.updateServiceProduct(product.id, { boosted: !product.boosted })
      setProducts(current => current.map(item => item.id === product.id
        ? { ...item, boosted: !product.boosted }
        : item))
      setError('')
    } catch (updateError) {
      setError(`Could not update ${product.digitalProduct ? 'digital' : category.name} promotion: ${updateError.message}`)
    }
  }

  const deleteProduct = async product => {
    if (window.confirm(`Delete "${product.title || product.name}"? This cannot be undone.`)) {
      try {
        await rootAPI.deleteServiceProduct(product.id)
        setProducts(current => current.filter(item => item.id !== product.id))
        setError('')
      } catch (deleteError) {
        setError(`Could not delete ${product.digitalProduct ? 'digital' : category.name} product: ${deleteError.message}`)
      }
    }
  }

  return (
    <section className="root-service-catalog">
      <h2 className="section-title">Service Catalog</h2>
      <p className="section-description">Manage products by service category. Only published products appear on the main service pages.</p>
      <form className="root-service-fee-settings" onSubmit={savePlatformFee}>
        <label>
          Platform service charge for account-owned products (%)
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={platformFeePercent}
            onChange={event => setPlatformFeePercent(event.target.value)}
          />
        </label>
        <p>Added to the listed price at checkout. The product owner receives the full listed amount; the platform receives this additional charge. New installations start at 0% until configured.</p>
        <button type="submit" disabled={savingFee || platformFeePercent === ''}>
          {savingFee ? 'Saving…' : 'Save service charge'}
        </button>
      </form>

      <div className="root-service-category-tabs" role="tablist" aria-label="Service categories">
        {SERVICE_CATEGORIES.map(item => (
          <button
            className={activeCategory === item.id ? 'active' : ''}
            id={`root-service-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={activeCategory === item.id}
            aria-controls="root-service-category-content"
            key={item.id}
            onClick={() => {
              setActiveCategory(item.id)
              setLastServiceCategory(item.storageKey)
              setProductPage(0)
              setEditingProduct(undefined)
            }}
          >
            <span>{item.icon}</span>{item.name}
          </button>
        ))}
        <button
          className={showingDigitalProducts ? 'active' : ''}
          id="root-service-tab-digital-products"
          type="button"
          role="tab"
          aria-selected={showingDigitalProducts}
          aria-controls="root-service-category-content"
          onClick={() => {
            setActiveCategory(DIGITAL_PRODUCTS_TAB)
            setProductPage(0)
            setEditingProduct(undefined)
          }}
        >
          <span>📥</span>Digital products
        </button>
      </div>

      <div
        className="root-service-category-content"
        id="root-service-category-content"
        role="tabpanel"
        aria-labelledby={showingDigitalProducts ? 'root-service-tab-digital-products' : `root-service-tab-${category.id}`}
      >
        <div className="root-service-category-heading">
          <div>
            <h3>{showingDigitalProducts ? 'Digital products' : category.name}</h3>
            <p>{showingDigitalProducts ? 'All uploaded digital products across service categories.' : category.description} · {visibleProducts.length} product{visibleProducts.length === 1 ? '' : 's'}</p>
          </div>
          <div className="root-service-add-actions">
            {!showingDigitalProducts && <button type="button" className="root-service-add-button" onClick={() => setEditingProduct(null)}>
              ＋ Add Service Product
            </button>}
            <button type="button" className="root-service-add-button digital" onClick={() => setEditingProduct({ digitalProduct: true, serviceKey: showingDigitalProducts ? lastServiceCategory : category.storageKey })}>
              ＋ Add Digital Product
            </button>
          </div>
        </div>

        {error && <p className="root-service-error" role="alert">{error}</p>}
        {visibleProducts.length > 0 ? (
          <>
          <div className="root-service-product-grid">
            {getPageItems(visibleProducts, safeProductPage).map(product => {
              const productName = product.title || product.name || 'Untitled product'
              const images = product.images?.length ? product.images : product.image ? [product.image] : []
              const productCategory = SERVICE_CATEGORIES.find(item => item.storageKey === product.serviceKey)
              return (
                <article className="root-service-product-card" key={product.id}>
                  {images.length > 0
                    ? <img className="root-service-product-image" src={images[0]} alt={productName} />
                    : <div className="root-service-product-placeholder">{productCategory?.icon || '📥'}</div>}
                  <div className="root-service-product-body">
                    <div className="root-service-product-title-row">
                      <h4>{productName}</h4>
                      <span className={`root-service-publish-state ${product.published === false ? 'unpublished' : ''}`}>
                        {product.published === false ? 'Unpublished' : 'Published'}
                      </span>
                    </div>
                    <p className="root-service-product-provider">
                      {product.organizationName || product.ownerName || 'Provider not set'}
                    </p>
                    {product.digitalProduct && <span className="root-service-digital-badge">Digital download</span>}
                    <p className="root-service-product-location">
                      {productCategory?.name || product.serviceKey}
                      {' · '}
                      {product.category || 'Other category'}
                      {product.location ? ` · ${product.location}` : ''}
                    </p>
                    <p className="root-service-product-location">
                      {[product.city, product.country].filter(Boolean).join(', ') || 'Location not set'}
                      {product.quantity !== null && product.quantity !== undefined ? ` · Qty: ${product.quantity}` : ''}
                    </p>
                    {(product.color || product.size) && (
                      <p className="root-service-product-location">
                        {[product.color && `Color: ${product.color}`, product.size && `Size: ${product.size}`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <strong className="root-service-product-price">ETB {Number(product.price || 0).toLocaleString()}</strong>
                    {(() => {
                      const compare = Number(product.compareAmount)
                      const price = Number(product.price)
                      if (product.compareAmount !== null && product.compareAmount !== undefined && product.compareAmount !== '' && compare > 0 && price > 0 && compare > price) {
                        const pct = Math.round(((compare - price) / compare) * 100)
                        return <span className="root-service-product-discount-badge" style={{ marginLeft: 8 }}>{pct}% OFF</span>
                      }
                      return null
                    })()}
                    {product.compareAmount !== null && product.compareAmount !== undefined && product.compareAmount !== '' && (
                      <strong className="root-service-product-compare-amount">
                        ETB {Number(product.compareAmount || 0).toLocaleString()}
                      </strong>
                    )}
                    <div className="root-service-product-options">
                      {[
                        ['serviceCharge', 'Service charge'],
                        ['firstPayment', 'First payment'],
                        ['fullPayment', 'Full payment'],
                      ].filter(([key]) => product.paymentOptions?.[key]?.enabled)
                        .map(([key, label]) => (
                          <span key={key}>
                            {label}: ETB {Number(product.paymentOptions[key].amount || 0).toLocaleString()}
                            {key === 'fullPayment' && product.paymentOptions[key].required ? ' · Required' : ''}
                          </span>
                        ))}
                    </div>
                    <CardShareActions
                      url={getServiceProductUrl(product.serviceKey, product.id) || window.location.href}
                      title={productName}
                      className="root-service-product-share"
                    />
                    <div className="root-service-product-actions">
                      <button type="button" onClick={() => setEditingProduct(product)}>Edit</button>
                      <button
                        type="button"
                        className={product.published === false ? 'publish' : 'unpublish'}
                        onClick={() => togglePublished(product)}
                      >
                        {product.published === false ? 'Publish' : 'Unpublish'}
                      </button>
                      <button type="button" onClick={() => toggleBoosted(product)}>
                        {product.boosted ? 'Unboost' : 'Boost everywhere'}
                      </button>
                      <button type="button" className="delete" onClick={() => deleteProduct(product)}>Delete</button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          <Pagination page={safeProductPage} itemCount={visibleProducts.length} onPageChange={setProductPage} label={`${showingDigitalProducts ? 'Digital' : category.name} products`} />
          </>
        ) : (
          <div className="root-service-empty">
            <span>{showingDigitalProducts ? '📥' : category.icon}</span>
            <p>{showingDigitalProducts ? 'No digital products have been uploaded yet.' : 'No products in this category yet.'}</p>
            <button type="button" onClick={() => setEditingProduct(showingDigitalProducts ? { digitalProduct: true, serviceKey: lastServiceCategory } : null)}>
              {showingDigitalProducts ? 'Add the first digital product' : 'Add the first service product'}
            </button>
          </div>
        )}
      </div>

      {editingProduct !== undefined && (
        <ServiceProductAdderModal
          initialProduct={editingProduct && editingProduct.id ? editingProduct : undefined}
          initialValues={editingProduct && !editingProduct.id ? { serviceKey: editingProduct.serviceKey } : {}}
          initialDigitalProduct={Boolean(editingProduct?.digitalProduct)}
          serviceCategories={SERVICE_CATEGORIES}
          onClose={() => setEditingProduct(undefined)}
          onSave={saveProduct}
        />
      )}
    </section>
  )
}

export default RootServiceCatalog
