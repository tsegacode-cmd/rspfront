import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { marketplaceAPI } from '../services/api'
import { getAccountRole } from '../utils/guestAccount'
import CardShareActions from '../components/CardShareActions'
import { getServiceProductUrl } from '../utils/serviceProductLinks'
import { PRODUCT_CATEGORIES, getProductCategory } from '../utils/productCategories'
import './Home.css'

const SERVICE_CATEGORIES = [
  { key: 'broker-house', title: 'Broker & House', path: '/broker-house', icon: '🏠' },
  { key: 'create-partnership', title: 'Brokerage', path: '/brokerage', icon: '🤝' },
  { key: 'room-booking', title: 'Room Booking', path: '/room-booking', icon: '🛏️' },
  { key: 'logistics', title: 'Logistics', path: '/logistics', icon: '🚗' },
  { key: 'movable-services', title: 'Big Service', path: '/movable-commission', icon: '📦' },
]

const getPromotionAudience = () => {
  if (getAccountRole() === 'guest') return 'guest'
  try {
    const user = JSON.parse(localStorage.getItem('userData') || '{}')
    const status = String(user.payment_status || user.paymentStatus || (user.is_paid === true ? 'paid' : user.is_paid === false ? 'unpaid' : '')).toLowerCase()
    const audience = ['paid', 'unpaid', 'other'].includes(status) ? status : 'user'
    return ['guest', 'user', 'paid', 'unpaid', 'other'].includes(audience) ? audience : 'user'
  } catch (error) {
    console.error('Could not determine promotion audience:', error)
    return 'user'
  }
}

const matchesProductSearch = (product, searchTerm, categoryTitle = '') => {
  if (!searchTerm) return true
  const searchableValues = value => {
    if (value == null) return []
    if (Array.isArray(value)) return value.flatMap(searchableValues)
    if (typeof value === 'object') return Object.values(value).flatMap(searchableValues)
    return [String(value)]
  }
  const searchableText = [
    product.title,
    product.name,
    product.description,
    product.detail,
    product.details,
    product.productDescription,
    product.productDetails,
    product.specification,
    product.specifications,
    product.features,
    product.tags,
    product.keywords,
    product.organizationName,
    product.ownerName,
    product.location,
    product.city,
    product.country,
    product.color,
    product.size,
    product.serviceKey,
    categoryTitle,
    getProductCategory(product),
  ].flatMap(searchableValues).join(' ').toLocaleLowerCase()
  return searchableText.includes(searchTerm)
}

function Home() {
  const [promotions, setPromotions] = useState([])
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [slide, setSlide] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const trackRef = useRef(null)
  const promotionAudience = getPromotionAudience()
  const searchTerm = searchQuery.trim().toLocaleLowerCase()
  const availableProductCategories = useMemo(() => {
    const found = new Set(products
      .filter(product => product.serviceKey !== 'boosted-posts')
      .map(getProductCategory))
    return [
      ...PRODUCT_CATEGORIES.filter(category => found.has(category)),
      ...[...found].filter(category => !PRODUCT_CATEGORIES.includes(category)).sort((left, right) => left.localeCompare(right)),
    ]
  }, [products])
  const productsByCategory = useMemo(() => SERVICE_CATEGORIES.map(category => ({
    ...category,
    products: products.filter(product =>
      product.serviceKey === category.key &&
      (searchTerm || categoryFilter === 'all' || getProductCategory(product) === categoryFilter) &&
      matchesProductSearch(product, searchTerm, category.title)
    ),
  })), [products, categoryFilter, searchTerm])
  const boostedProducts = products.filter(product =>
    product.serviceKey === 'boosted-posts' && matchesProductSearch(product, searchTerm, 'Popular & sponsored')
  )
  const hasSearchResults = boostedProducts.length > 0 || productsByCategory.some(category => category.products.length > 0)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [promotionResponse, productResponse] = await Promise.all([
          marketplaceAPI.getPromotions(promotionAudience),
          marketplaceAPI.getProducts(),
        ])
        if (!active) return
        setPromotions(promotionResponse.data)
        setSlide(index => promotionResponse.data.length ? index % promotionResponse.data.length : 0)
        setProducts(productResponse.data)
        setError('')
      } catch (loadError) {
        if (active) setError(`Could not load marketplace content: ${loadError.message}`)
      }
    }
    load()
    const interval = window.setInterval(load, 30000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [promotionAudience])

  useEffect(() => {
    if (promotions.length < 2) return undefined
    const timer = window.setInterval(() => setSlide(index => (index + 1) % promotions.length), 3000)
    return () => window.clearInterval(timer)
  }, [promotions.length])

  useEffect(() => {
    const track = trackRef.current
    if (track) track.scrollTo({ left: track.clientWidth * slide, behavior: 'smooth' })
  }, [slide, promotions.length])

  const handleSliderScroll = () => {
    const track = trackRef.current
    if (!track || !track.clientWidth) return
    const nextSlide = Math.round(track.scrollLeft / track.clientWidth)
    const snappedLeft = nextSlide * track.clientWidth
    if (Math.abs(track.scrollLeft - snappedLeft) <= 2 && nextSlide !== slide) setSlide(nextSlide)
  }

  return (
    <main className="home-marketplace">
      {error && <p className="home-marketplace-error" role="alert">{error}</p>}

      {promotions.length > 0 && (
        <section className="home-promotion-section" aria-label="Promotions">
          <div className="home-section-heading">
            <div><span>REDSEA OFFERS</span><h1>Promotions</h1></div>
            <p>Featured updates and deals from our team</p>
          </div>
          <div className="home-promotion-viewport" ref={trackRef} onScroll={handleSliderScroll}>
            {promotions.map(promotion => {
              const Slide = promotion.button_url ? 'a' : 'article'
              const linkProps = promotion.button_url
                ? {
                    href: promotion.button_url,
                    target: /^https?:\/\//i.test(promotion.button_url) ? '_blank' : undefined,
                    rel: /^https?:\/\//i.test(promotion.button_url) ? 'noreferrer' : undefined,
                  }
                : {}
              return (
                <Slide
                  key={promotion.id}
                  className={`home-promotion-slide ${promotion.button_url ? 'clickable' : ''}`}
                  style={{ '--promotion-background': promotion.background_color }}
                  {...linkProps}
                >
                  {promotion.image_data && <img src={promotion.image_data} alt="" className="home-promotion-image" />}
                  <div className="home-promotion-copy">
                    {promotion.badge_text && <span className="home-promotion-badge">{promotion.badge_text}</span>}
                    <h2>{promotion.title}</h2>
                    {promotion.message && <p>{promotion.message}</p>}
                    {promotion.button_text && promotion.button_url && (
                      <span className="home-promotion-button">{promotion.button_text} →</span>
                    )}
                    {promotion.pinned && <span className="home-promotion-pin">📌 Pinned alert</span>}
                  </div>
                </Slide>
              )
            })}
          </div>
          {promotions.length > 1 && (
            <div className="home-promotion-dots" aria-label="Choose promotion">
              {promotions.map((promotion, index) => (
                <button
                  key={promotion.id}
                  type="button"
                  className={index === slide ? 'active' : ''}
                  onClick={() => setSlide(index)}
                  aria-label={`Show promotion ${index + 1}: ${promotion.title}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="home-catalog-section">
        <div className="home-section-heading">
          <div><span>DISCOVER REDSEA</span><h2>Services &amp; Products</h2></div>
          <p>Browse published listings across every service category.</p>
        </div>
        <div className="home-catalog-search">
          <label htmlFor="home-catalog-search">Search all services and products</label>
          <div className="home-catalog-search-field">
            <span aria-hidden="true">⌕</span>
            <input
              id="home-catalog-search"
              type="search"
              value={searchQuery}
              onChange={event => {
                setSearchQuery(event.target.value)
                if (event.target.value.trim()) setCategoryFilter('all')
              }}
              placeholder="Search listings, locations, providers..."
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                ×
              </button>
            )}
          </div>
        </div>
        {availableProductCategories.length > 0 && (
          <div className="home-product-category-filters" role="group" aria-label="Filter products by category">
            <button
              type="button"
              className={categoryFilter === 'all' ? 'active' : ''}
              aria-pressed={categoryFilter === 'all'}
              onClick={() => setCategoryFilter('all')}
            >
              All
            </button>
            {availableProductCategories.map(category => (
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
        {products.length === 0 && !error && <p className="home-catalog-empty">New products and services will appear here as they are published.</p>}
        {boostedProducts.length > 0 && (
          <section className="home-category home-featured-boosts" aria-label="Sponsored products">
            <div className="home-category-heading"><h3><span>🚀</span>Popular &amp; sponsored</h3><Link to="/feed">See the community feed →</Link></div>
            <div className="home-product-grid">
              {boostedProducts.map(product => (
                <article className="home-product-card boosted" key={product.id}>
                  <a className="home-product-card-link" href={product.productUrl || '/feed'} target={product.productUrl ? '_blank' : undefined} rel={product.productUrl ? 'noreferrer' : undefined}>
                    {product.image
                      ? <img src={product.image} alt={product.title} />
                      : <span className="home-product-placeholder">🚀</span>}
                    <div className="home-product-copy">
                      <span className="home-product-boost-badge">Sponsored</span>
                      <h4>{product.title}</h4>
                      <p>{product.organizationName}</p>
                      {product.price != null && <strong>ETB {Number(product.price).toLocaleString()}</strong>}
                      {product.productUrl && <span className="home-product-location">View product →</span>}
                    </div>
                  </a>
                  <CardShareActions
                    url={product.productUrl || `${window.location.origin}/feed`}
                    title={product.title || 'Boosted product'}
                    className="home-product-share"
                  />
                </article>
              ))}
            </div>
          </section>
        )}
        {productsByCategory.filter(category => category.products.length > 0).map(category => (
          <section className="home-category" key={category.key} aria-label={category.title}>
            <div className="home-category-heading">
              <h3><span>{category.icon}</span>{category.title}</h3>
              <Link to={category.path}>View category →</Link>
            </div>
            <div className="home-product-grid">
              {category.products.map(product => {
                const title = product.title || product.name || 'Service'
                const image = product.images?.[0] || product.image
                return (
                  <article className={`home-product-card ${product.boosted ? 'boosted' : ''}`} key={product.id}>
                    <Link className="home-product-card-link" to={`${category.path}?product=${encodeURIComponent(product.id)}`} aria-label={`Browse ${title}`}>
                      {image
                        ? <img src={image} alt={title} />
                        : <span className="home-product-placeholder">{category.icon}</span>}
                      <div className="home-product-copy">
                        {product.boosted && <span className="home-product-boost-badge">Boosted</span>}
                        <span className="home-product-category">{getProductCategory(product)}</span>
                        <h4>{title}</h4>
                        <p>{product.organizationName || product.ownerName || 'Service provider'}</p>
                        <strong>ETB {Number(product.price || 0).toLocaleString()}</strong>
                        {(product.location || product.city || product.country) && (
                          <span className="home-product-location">
                            {[product.location, product.city, product.country].filter(Boolean).join(', ')}
                          </span>
                        )}
                        {(product.color || product.size) && (
                          <span className="home-product-location">
                            {[product.color && `Color: ${product.color}`, product.size && `Size: ${product.size}`].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                    </Link>
                    <CardShareActions
                      url={getServiceProductUrl(category.key, product.id)}
                      title={title}
                      className="home-product-share"
                    />
                  </article>
                )
              })}
            </div>
          </section>
        ))}
        {searchTerm && !hasSearchResults && (
          <p className="home-catalog-empty" role="status">No services or products match “{searchQuery.trim()}”.</p>
        )}
      </section>
    </main>
  )
}

export default Home
