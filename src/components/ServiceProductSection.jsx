import { useEffect, useState } from 'react'
import { marketplaceAPI } from '../services/api'
import ServiceProductGrid from './ServiceProductGrid'
import { getServiceProductUrl } from '../utils/serviceProductLinks'
import { getProductCategory } from '../utils/productCategories'
import './ServiceProductSection.css'

const SERVICE_LABELS = {
  'broker-house': 'Broker & House',
  'create-partnership': 'Create Partnership',
  'room-booking': 'Room Booking',
  'logistics': 'Logistics / Vehicle Rental',
  'movable-services': 'Big Service',
}

function ServiceProductSection({
  serviceKey,
  items = [],
  emptyMessage,
  accent,
  onBook,
  onEdit,
  onDelete,
}) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [error, setError] = useState('')
  const serviceLabel = SERVICE_LABELS[serviceKey] || 'Service'

  useEffect(() => {
    let active = true
    const loadProducts = async () => {
      try {
        const [response, settingsResponse] = await Promise.all([
          marketplaceAPI.getProducts(serviceKey),
          marketplaceAPI.getSettings(),
        ])
        if (!active) return
        const platformFeePercent = Number(settingsResponse.data?.platformServiceChargePercent) || 0
        setProducts(response.data.map(product => ({
          ...product,
          platformFeePercent: product.ownerProduct ? platformFeePercent : 0,
        })))
        setError('')
      } catch (loadError) {
        if (active) setError(`Could not load service products: ${loadError.message}`)
      }
    }

    loadProducts()
    const interval = window.setInterval(loadProducts, 30000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [serviceKey])

  const productCards = products.map(product => ({
    ...product,
    catalog: true,
    title: product.title || product.name,
    category: getProductCategory(product),
    subtitle: product.organizationName || product.ownerName || 'Service provider',
    statusLabel: product.statusLabel || 'Available',
    boosted: product.boosted,
    price: `ETB ${Number(product.price || 0).toLocaleString()}`,
    priceLabel: 'Price',
    compareAmount: product.compareAmount,
    discountPercent: (() => {
      const compare = Number(product.compareAmount)
      const price = Number(product.price)
      if (product.compareAmount !== null && product.compareAmount !== undefined && product.compareAmount !== '' && compare > 0 && price > 0 && compare > price) {
        return Math.round(((compare - price) / compare) * 100)
      }
      return null
    })(),
    details: [
      `Category: ${getProductCategory(product)}`,
      product.location && `Location: ${product.location}`,
      [product.city, product.country].filter(Boolean).join(', ') && `City / country: ${[product.city, product.country].filter(Boolean).join(', ')}`,
      product.size && `Size: ${product.size}`,
      product.quantity !== null && product.quantity !== undefined && `Quantity: ${product.quantity}`,
      product.deliveryEnabled && `Delivery available · ETB ${Number(product.deliveryFee || 0).toLocaleString()} payable on receipt`,
      product.platformFeePercent > 0 && `Platform service charge: ${product.platformFeePercent}% added at checkout`,
    ],
    shareUrl: getServiceProductUrl(serviceKey, product.id),
    serviceProduct: true,
  }))
  const recordCards = items.map(item => ({
    ...item,
    catalog: item.catalog || false,
    category: item.category || serviceLabel,
    shareUrl: getServiceProductUrl(serviceKey, item.id),
  }))
  const allCards = [...recordCards, ...productCards]
  const categories = [...new Set(allCards.map(card => card.category).filter(Boolean))]
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredCards = allCards.filter(card => {
    const matchesCategory = categoryFilter === 'all' || card.category === categoryFilter
    const searchableText = [
      card.title,
      card.subtitle,
      card.category,
      card.city,
      card.country,
      card.price,
      card.quantity,
      ...(card.details || []),
    ].filter(Boolean).join(' ').toLocaleLowerCase()
    return matchesCategory && (!normalizedSearch || searchableText.includes(normalizedSearch))
  })

  return (
    <section className="service-product-section">
      {error && <p className="service-product-section-error" role="alert">{error}</p>}
      {allCards.length > 0 && (
        <div className="service-product-filters">
          <label className="service-product-search">
            <span className="sr-only">Search products and services</span>
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search products and services..."
            />
          </label>
        </div>
      )}
      {allCards.length > 0 && (
        <div className="service-product-category-chips" role="group" aria-label="Filter products by category">
          <button type="button" className={categoryFilter === 'all' ? 'active' : ''} aria-pressed={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
            All
          </button>
          {categories.map(category => (
            <button
              key={category}
              type="button"
              className={categoryFilter === category ? 'active' : ''}
              aria-pressed={categoryFilter === category}
              onClick={() => setCategoryFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>
      )}
      <ServiceProductGrid
        items={filteredCards}
        emptyMessage={allCards.length > 0 ? 'No products or services match your search.' : emptyMessage}
        accent={accent}
        onBook={onBook}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </section>
  )
}

export default ServiceProductSection
