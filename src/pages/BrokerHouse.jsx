import { useEffect, useState } from 'react'
import ServiceProductSection from '../components/ServiceProductSection'
import BookingPaymentModal from '../components/BookingPaymentModal'
import { saveServiceBookingRequest } from '../utils/serviceBookingRequests'
import './CommissionPages.css'

const EMPTY_LISTING = {
  title: '',
  propertyType: '',
  transactionType: 'rent',
  location: '',
  price: '',
  contactName: '',
  contactPhone: '',
  description: '',
}

function BrokerHouse() {
  const [listings, setListings] = useState([])
  const [form, setForm] = useState(EMPTY_LISTING)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [bookingListing, setBookingListing] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const savedListings = localStorage.getItem('broker_house_listings')
      if (savedListings) setListings(JSON.parse(savedListings))
    } catch (loadError) {
      setError(`Could not load property listings: ${loadError.message}`)
    }
  }, [])

  const persist = nextListings => {
    try {
      localStorage.setItem('broker_house_listings', JSON.stringify(nextListings))
      setListings(nextListings)
      return true
    } catch (saveError) {
      setError(`Could not save property listing: ${saveError.message}`)
      return false
    }
  }

  const updateField = (field, value) => {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
  }

  const submitListing = () => {
    if (!form.title.trim() || !form.location.trim() || !form.price.trim()) {
      setError('Title, location and price are required.')
      return
    }

    const listing = {
      ...form,
      title: form.title.trim(),
      location: form.location.trim(),
      price: Number(form.price),
      id: editId || Date.now(),
      status: editId ? (listings.find(item => item.id === editId)?.status || 'available') : 'available',
      createdAt: editId ? listings.find(item => item.id === editId)?.createdAt : new Date().toISOString(),
    }
    const nextListings = editId
      ? listings.map(item => item.id === editId ? listing : item)
      : [listing, ...listings]

    if (persist(nextListings)) {
      setForm(EMPTY_LISTING)
      setEditId(null)
      setShowForm(false)
      setMessage(editId ? 'Listing updated.' : 'Property listing added.')
      setTimeout(() => setMessage(''), 3000)
    }
  }

  const editListing = listing => {
    setForm({ ...EMPTY_LISTING, ...listing, price: String(listing.price ?? '') })
    setEditId(listing.id)
    setShowForm(true)
  }

  const deleteListing = id => {
    if (window.confirm('Delete this property listing?')) persist(listings.filter(item => item.id !== id))
  }

  const confirmBooking = async (paymentMethod, paymentSelection, customer) => {
    if (bookingListing.catalog || bookingListing.serviceProduct) {
      try {
        await saveServiceBookingRequest(bookingListing, paymentMethod, paymentSelection, customer)
        setBookingListing(null)
        setMessage(paymentMethod === 'REDSEA Wallet'
          ? 'Property successfully booked and paid from your REDSEA real wallet.'
          : `Your booking and payment request were sent using ${paymentMethod}. Waiting for payment approval.`)
        return true
      } catch (saveError) {
        setError(saveError.message)
        return saveError.message
      }
    }

    try {
      await saveServiceBookingRequest({
        ...bookingListing,
        title: bookingListing.title,
        category: 'Broker & House',
        price: `ETB ${Number(bookingListing.price).toLocaleString()}`,
      }, paymentMethod, paymentSelection, customer)
    } catch (saveError) {
      setError(saveError.message)
      return saveError.message
    }

    const nextListings = listings.map(listing => listing.id === bookingListing.id
      ? {
          ...listing,
          paymentMethod,
          paymentStatus: 'submitted',
          transactionReference: customer.transactionReference,
          status: 'pending_approval',
          bookingRequestedAt: new Date().toISOString(),
        }
      : listing)

    if (persist(nextListings)) {
      setBookingListing(null)
      setMessage(`Your booking and payment request were sent using ${paymentMethod}. Waiting for payment approval.`)
      return true
    }
    return false
  }

  return (
    <div className="cp-page">
      <div className="cp-container">
        <div className="cp-titlebar" style={{ background: 'linear-gradient(135deg,#154360,#2471a3)' }}>
          <span className="cp-titlebar-icon">🏠</span>
          <div className="cp-titlebar-text"><h1>Broker &amp; House</h1><p>Browse and manage property listings</p></div>
        </div>
        {error && <div className="cp-alert error">⚠️ {error}</div>}
        {message && <div className="cp-alert success">✅ {message}</div>}

        {showForm && (
          <section className="cp-form-card" style={{ borderTopColor: '#2471a3' }}>
            <div className="cp-form-header">
              <h2>{editId ? 'Edit Property' : 'Add Property Listing'}</h2>
              <button className="cp-close-btn" type="button" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="cp-form-grid">
              <div className="cp-field"><label>Listing title *</label><input className="cp-input" value={form.title} onChange={event => updateField('title', event.target.value)} placeholder="e.g. Two-bedroom apartment"/></div>
              <div className="cp-field"><label>Property type</label><select className="cp-select" value={form.propertyType} onChange={event => updateField('propertyType', event.target.value)}><option value="">Choose a type</option><option>Apartment</option><option>House</option><option>Villa</option><option>Office</option><option>Land</option><option>Shop</option></select></div>
              <div className="cp-field"><label>Offer type</label><select className="cp-select" value={form.transactionType} onChange={event => updateField('transactionType', event.target.value)}><option value="rent">For rent</option><option value="sale">For sale</option></select></div>
              <div className="cp-field"><label>Location *</label><input className="cp-input" value={form.location} onChange={event => updateField('location', event.target.value)} placeholder="City, area or address"/></div>
              <div className="cp-field"><label>Price (ETB) *</label><input className="cp-input" type="number" min="0" value={form.price} onChange={event => updateField('price', event.target.value)} placeholder="Enter price"/></div>
              <div className="cp-field"><label>Contact name</label><input className="cp-input" value={form.contactName} onChange={event => updateField('contactName', event.target.value)} /></div>
              <div className="cp-field"><label>Contact phone</label><input className="cp-input" value={form.contactPhone} onChange={event => updateField('contactPhone', event.target.value)} /></div>
              <div className="cp-field cp-full"><label>Description</label><textarea className="cp-input" rows={3} value={form.description} onChange={event => updateField('description', event.target.value)} /></div>
            </div>
            <div className="cp-form-actions">
              <button type="button" className="cp-btn primary" style={{ background: '#2471a3' }} onClick={submitListing}>Save Listing</button>
              <button type="button" className="cp-btn secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </section>
        )}

        <ServiceProductSection
          serviceKey="broker-house"
          items={[

            ...listings.map(listing => ({
              id: listing.id,
              icon: listing.propertyType === 'Land' ? '🌿' : '🏠',
              title: listing.title,
              subtitle: `${listing.propertyType || 'Property'} · ${listing.transactionType === 'sale' ? 'For sale' : 'For rent'}`,
              statusLabel: listing.status === 'booking_requested' ? 'Booking requested' : 'Available',
              price: `ETB ${Number(listing.price).toLocaleString()}`,
              priceLabel: listing.transactionType === 'sale' ? 'Sale price' : 'Rental price',
              details: [listing.location, listing.contactName && `Contact: ${listing.contactName}`, listing.contactPhone, listing.description],
              paymentMethod: listing.paymentMethod,
            })),
          ]}
          emptyMessage="No property listings yet. Add a listing to show it here."
          accent="#2471a3"
          onBook={item => setBookingListing(item.catalog || item.serviceProduct ? item : listings.find(listing => listing.id === item.id))}
          onEdit={item => editListing(listings.find(listing => listing.id === item.id))}
          onDelete={deleteListing}
        />
        {bookingListing && <BookingPaymentModal
          itemName={bookingListing.title}
          amount={bookingListing.serviceProduct || bookingListing.catalog
            ? (bookingListing.price === 'Contact for price'
              ? 'Amount to be confirmed'
              : `ETB ${Number(bookingListing.price).toLocaleString()}`)
            : `ETB ${Number(bookingListing.price).toLocaleString()}`}
          paymentOptions={bookingListing.paymentOptions}
          itemId={bookingListing.catalog || bookingListing.serviceProduct ? bookingListing.id : ''}
          deliveryEnabled={Boolean(bookingListing.deliveryEnabled)}
          deliveryFee={bookingListing.deliveryFee || 0}
          onClose={() => setBookingListing(null)}
          onConfirm={confirmBooking}
        />}
      </div>
    </div>
  )
}

export default BrokerHouse
