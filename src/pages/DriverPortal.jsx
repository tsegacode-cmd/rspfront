import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import MiniRideMap from '../components/MiniRideMap'
import { miniRideAPI } from '../services/api'
import Wallet from './Wallet'
import './MiniRidePages.css'

const money = value => `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const statusLabel = value => String(value || '').replaceAll('_', ' ')
const activeRideStatuses = new Set(['accepted', 'in_progress', 'cash_confirmation', 'payment_review'])
const DRIVER_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'tracker', label: 'Map tracker' },
  { id: 'wallet', label: 'Wallet' },
]
const emptyApplication = () => ({
  fullName: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  nationalIdNumber: '',
  nationalIdFront: '',
  nationalIdBack: '',
  driverLicense: '',
  collateral: '',
  agreementAccepted: false,
})

const readPdfFile = file => new Promise((resolve, reject) => {
  if (!file) {
    reject(new Error('Choose a PDF file to continue.'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('The PDF could not be read.'))
  reader.readAsDataURL(file)
})

function DriverPortal() {
  let account = null
  try { account = JSON.parse(localStorage.getItem('userData') || 'null') } catch { account = null }
  const [dashboard, setDashboard] = useState({ status: {}, rides: [], settings: {}, summary: {} })
  const [applicationStatus, setApplicationStatus] = useState(null)
  const [applicationForm, setApplicationForm] = useState(emptyApplication())
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const previousRideStatuses = useRef({})
  const [showRideThanks, setShowRideThanks] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const loadApplication = useCallback(async () => {
    try {
      const response = await miniRideAPI.getDriverApplicationStatus()
      setApplicationStatus(response?.data || null)
      setError('')
    } catch (loadError) {
      if (loadError?.status === 404) {
        setApplicationStatus(null)
      } else {
        setError(loadError.message || 'Could not load your driver onboarding status.')
      }
    }
  }, [])

  const load = useCallback(async (showError = true) => {
    try {
      const response = await miniRideAPI.getDriverDashboard()
      const nextDashboard = response.data || { status: {}, rides: [], settings: {}, summary: {} }
      if ((nextDashboard.rides || []).some(ride =>
        previousRideStatuses.current[ride.ride_id] === 'cash_confirmation' &&
        ride.status === 'completed' && ride.payment_method === 'Cash'
      )) setShowRideThanks(true)
      previousRideStatuses.current = Object.fromEntries((nextDashboard.rides || []).map(ride => [ride.ride_id, ride.status]))
      setDashboard(nextDashboard)
      setError('')
    } catch (loadError) {
      if (showError) setError(loadError.message || 'Could not load your driver dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('authToken') || String(account?.role || '').toLowerCase() !== 'driver') return undefined
    const init = async () => {
      await loadApplication()
      await load(false)
    }
    init()
    const timer = window.setInterval(() => { load(false); loadApplication(); }, 5000)
    return () => window.clearInterval(timer)
  }, [load, loadApplication, account?.role])

  const online = Boolean(dashboard.status?.online)
  const currentRide = dashboard.rides.find(ride => activeRideStatuses.has(ride.status)) || null
  const applicationGateOpen = !applicationStatus || ['pending', 'rejected'].includes(applicationStatus.status)

  const updatePosition = useCallback(async (position, rideId) => {
    const location = { latitude: position.coords.latitude, longitude: position.coords.longitude }
    await miniRideAPI.updateDriverStatus({ online: true, ...location })
    if (rideId) await miniRideAPI.updateLocation(rideId, location)
  }, [])

  useEffect(() => {
    if (applicationGateOpen || !online || !navigator.geolocation) return undefined
    let active = true
    let watchId
    let latest = null
    let lastSentAt = 0
    const send = async () => {
      if (!active || !latest || Date.now() - lastSentAt < 8000) return
      lastSentAt = Date.now()
      try {
        await updatePosition(latest, currentRide?.status === 'in_progress' ? currentRide.ride_id : null)
      } catch (locationError) {
        if (active) setError(`Location update failed: ${locationError.message || 'Please check your connection.'}`)
      }
    }
    watchId = navigator.geolocation.watchPosition(
      position => { latest = position; send() },
      locationError => {
        if (active) setError(locationError.code === locationError.PERMISSION_DENIED
          ? 'Location permission was denied. You are still marked online until the last location expires.'
          : 'Could not refresh your live driver location.')
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
    const heartbeat = window.setInterval(send, 20000)
    return () => {
      active = false
      navigator.geolocation.clearWatch(watchId)
      window.clearInterval(heartbeat)
    }
  }, [applicationGateOpen, online, currentRide?.ride_id, currentRide?.status, updatePosition])

  const toggleOnline = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      if (online) {
        await miniRideAPI.updateDriverStatus({ online: false })
        setNotice('You are offline. Your last location is no longer shared with passengers.')
      } else {
        if (!navigator.geolocation) throw new Error('This device does not support location sharing.')
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
          resolve,
          locationError => reject(new Error(locationError.code === locationError.PERMISSION_DENIED
            ? 'Location permission is required before going online.'
            : 'Could not get your location. Check your device location settings.')),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        ))
        await updatePosition(position)
        setNotice('You are online and visible to passengers who share a ride request.')
      }
      await load()
    } catch (actionError) {
      setError(actionError.message || 'Could not update driver status.')
    } finally {
      setBusy(false)
    }
  }

  const rideAction = async (rideId, action) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await miniRideAPI[action](rideId)
      setNotice(action === 'acceptRide' ? 'Ride accepted.' : action === 'startRide' ? 'Ride started.' : action === 'confirmCash' ? 'Cash payment confirmed. Thank you — the ride is complete.' : 'Ride updated.')
      await load()
    } catch (actionError) {
      setError(actionError.message || 'Could not update ride.')
    } finally {
      setBusy(false)
    }
  }

  const openRides = useMemo(() => dashboard.rides.filter(ride => ride.status === 'requested'), [dashboard.rides])

  const handleDocumentUpload = async (field, event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.type && !file.type.toLowerCase().includes('pdf')) {
      setError('Please upload PDF documents only for your driver application.')
      return
    }
    try {
      const fileData = await readPdfFile(file)
      setApplicationForm(previous => ({ ...previous, [field]: fileData }))
      setError('')
    } catch (docError) {
      setError(docError.message || 'The PDF file could not be uploaded.')
    }
  }

  const handleApplicationSubmit = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        fullName: String(applicationForm.fullName || '').trim(),
        phone: String(applicationForm.phone || '').trim(),
        email: String(applicationForm.email || '').trim(),
        address: String(applicationForm.address || '').trim(),
        city: String(applicationForm.city || '').trim(),
        nationalIdNumber: String(applicationForm.nationalIdNumber || '').trim(),
        nationalIdFront: String(applicationForm.nationalIdFront || '').trim(),
        nationalIdBack: String(applicationForm.nationalIdBack || '').trim(),
        driverLicense: String(applicationForm.driverLicense || '').trim(),
        collateral: String(applicationForm.collateral || '').trim(),
        agreementAccepted: Boolean(applicationForm.agreementAccepted),
      }
      if (!payload.fullName || !payload.phone || !payload.address || !payload.city || !payload.nationalIdNumber) {
        throw new Error('Please complete all personal details before submitting.')
      }
      if (!payload.nationalIdFront || !payload.nationalIdBack || !payload.driverLicense || !payload.collateral) {
        throw new Error('Upload the national ID front and back, driver licence, and collateral PDF documents.')
      }
      if (!payload.agreementAccepted) {
        throw new Error('You must accept the terms and policies before submitting.')
      }
      const response = await miniRideAPI.submitDriverApplication(payload)
      setApplicationStatus(response?.data || payload)
      setNotice('Your driver application has been submitted to the REDSEA root team for review.')
      setApplicationForm(emptyApplication())
    } catch (actionError) {
      setError(actionError.message || 'Could not submit your driver application.')
    } finally {
      setBusy(false)
    }
  }

  const renderOnboardingForm = () => (
    <main className="mini-ride-page">
      <section className="mr-card mr-onboarding-card">
        <div className="mr-section-title">
          <div>
            <span className="mr-eyebrow">Driver onboarding</span>
            <h2>Complete your driver verification before entering the portal</h2>
          </div>
        </div>
        {applicationStatus?.status === 'pending' && <div className="mr-alert mr-success" role="status">Your application is pending Root review.</div>}
        {applicationStatus?.status === 'rejected' && <div className="mr-alert mr-error" role="alert">Your last submission was rejected. Please review the notes and resubmit the required documents.</div>}
        <form className="mr-form mr-onboarding-form" onSubmit={handleApplicationSubmit}>
          <div className="mr-form-grid">
            <label>Full legal name<input required type="text" value={applicationForm.fullName} onChange={event => setApplicationForm(previous => ({ ...previous, fullName: event.target.value }))} /></label>
            <label>Phone number<input required type="tel" value={applicationForm.phone} onChange={event => setApplicationForm(previous => ({ ...previous, phone: event.target.value }))} /></label>
            <label>Email address<input type="email" value={applicationForm.email} onChange={event => setApplicationForm(previous => ({ ...previous, email: event.target.value }))} /></label>
            <label>National ID number<input required type="text" value={applicationForm.nationalIdNumber} onChange={event => setApplicationForm(previous => ({ ...previous, nationalIdNumber: event.target.value }))} /></label>
            <label>Home address<input required type="text" value={applicationForm.address} onChange={event => setApplicationForm(previous => ({ ...previous, address: event.target.value }))} /></label>
            <label>City<input required type="text" value={applicationForm.city} onChange={event => setApplicationForm(previous => ({ ...previous, city: event.target.value }))} /></label>
          </div>
          <div className="mr-doc-grid">
            <label className="mr-upload-card">National ID front (PDF)<input required type="file" accept="application/pdf" onChange={event => handleDocumentUpload('nationalIdFront', event)} /></label>
            <label className="mr-upload-card">National ID back (PDF)<input required type="file" accept="application/pdf" onChange={event => handleDocumentUpload('nationalIdBack', event)} /></label>
            <label className="mr-upload-card">Driver licence (PDF)<input required type="file" accept="application/pdf" onChange={event => handleDocumentUpload('driverLicense', event)} /></label>
            <label className="mr-upload-card">Collateral proof (PDF)<input required type="file" accept="application/pdf" onChange={event => handleDocumentUpload('collateral', event)} /></label>
          </div>
          <label className="mr-checkbox">
            <input type="checkbox" checked={applicationForm.agreementAccepted} onChange={event => setApplicationForm(previous => ({ ...previous, agreementAccepted: event.target.checked }))} />
            I accept REDSEA's driver terms, policies, respectful passenger conduct, and proper cash collection rules.
          </label>
          <button type="submit" className="mr-primary mr-wide" disabled={busy}>{busy ? 'Submitting…' : 'Submit driver application'}</button>
        </form>
      </section>
    </main>
  )

  if (!localStorage.getItem('authToken') || String(account?.role || '').toLowerCase() !== 'driver') {
    return <main className="mini-ride-page"><section className="mr-card mr-login"><h1>Driver portal</h1><p>Sign in with an active driver account to manage Mini Ride requests.</p><Link to="/login" className="mr-primary">Sign in</Link></section></main>
  }

  if (applicationGateOpen) return renderOnboardingForm()

  return (
    <main className="mini-ride-page">
      {showRideThanks && (
        <div className="mr-modal-backdrop" role="presentation">
          <section className="mr-completion-modal" role="dialog" aria-modal="true" aria-labelledby="mr-driver-thanks-title">
            <span aria-hidden="true">✓</span><h2 id="mr-driver-thanks-title">Ride complete</h2>
            <p>Cash payment was confirmed and this trip is complete. Thank you for driving with REDSEA!</p>
            <button type="button" className="mr-primary" onClick={() => setShowRideThanks(false)}>Done</button>
          </section>
        </div>
      )}
      <header className="mr-heading"><div><span className="mr-eyebrow">REDSEA driver workspace</span><h1>Driver portal</h1><p>Manage ride requests, share your location and review earnings.</p></div>
        <button type="button" className={online ? 'mr-secondary mr-online-toggle online' : 'mr-primary mr-online-toggle'} disabled={busy} onClick={toggleOnline}>{busy ? 'Updating…' : online ? '● Online — Go offline' : '○ Go online'}</button>
      </header>
      {error && <div className="mr-alert mr-error" role="alert">{error}</div>}
      {notice && <div className="mr-alert mr-success" role="status">{notice}</div>}
      <div className="mr-stats">
        <article className="mr-card"><span>Completed trips</span><strong>{dashboard.summary?.totalTrips || 0}</strong></article>
        <article className="mr-card"><span>Wallet earnings</span><strong>{money(dashboard.summary?.walletEarnings)}</strong></article>
        <article className="mr-card"><span>Mini Ride reward coins</span><strong>{Number(dashboard.summary?.coinEarnings || 0).toLocaleString()}</strong></article>
        <article className="mr-card"><span>Driver status</span><strong className={online ? 'mr-online-text' : 'mr-muted'}>{online ? 'Online' : 'Offline'}</strong></article>
      </div>
      <nav className="mr-driver-tabs" role="tablist" aria-label="Driver portal sections">
        {DRIVER_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`mr-driver-tab-${tab.id}`}
            aria-controls={`mr-driver-panel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {activeTab === 'overview' && (
        <div id="mr-driver-panel-overview" role="tabpanel" aria-labelledby="mr-driver-tab-overview">
      {currentRide && (
        <section className="mr-card">
          <div className="mr-section-title"><div><h2>Active ride</h2><p className="mr-muted">Your current trip updates in real time.</p></div><span className="mr-live"><i /> {statusLabel(currentRide.status)}</span></div>
          <div className="mr-driver-trip">
            <div className="mr-ride-summary">
              <p><b>Passenger</b><span>{currentRide.passenger_username || 'Passenger'}</span></p>
              <p><b>Pickup</b><span>{currentRide.pickup_label}</span></p>
              <p><b>Destination</b><span>{currentRide.destination}</span></p>
              <p><b>Fare</b><span>{money(currentRide.fare_amount || 0)}</span></p>
            </div>
            <MiniRideMap drivers={[]} ride={currentRide} height={260} />
          </div>
        </section>
      )}
      <section className="mr-card">
        <div className="mr-section-title"><div><h2>Ride requests</h2><p className="mr-muted">Select a ride to accept or confirm your next trip.</p></div><span className="mr-count">{openRides.length}</span></div>
        {loading ? <p className="mr-muted">Loading your driver dashboard…</p> : !openRides.length ? <p className="mr-muted">No new ride requests are waiting. You can stay online to receive the next trip.</p> : (
          <div className="mr-request-list">
            {openRides.map(ride => (
              <article key={ride.ride_id} className="mr-request">
                <div>
                  <span className="mr-status">{statusLabel(ride.status)}</span>
                  <h3>{ride.passenger_username || 'Passenger'} · {ride.pickup_label}</h3>
                  <p>{ride.destination}</p>
                </div>
                <button type="button" className="mr-primary" disabled={busy} onClick={() => rideAction(ride.ride_id, 'acceptRide')}>Accept</button>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="mr-card">
        <div className="mr-section-title"><div><h2>Trip activity</h2><p className="mr-muted">Review your assigned rides and confirm any cash payment after service.</p></div></div>
        {loading && !dashboard.rides.length ? <p className="mr-muted">Loading trip history…</p> : !dashboard.rides.length ? <p className="mr-muted">No trips yet.</p> : (
          <div className="mr-table-wrap"><table><thead><tr><th>Passenger</th><th>Trip</th><th>Fare</th><th>Status</th><th>Update</th></tr></thead><tbody>
            {dashboard.rides.map(ride => (
              <tr key={ride.ride_id}>
                <td>{ride.passenger_username || 'Passenger'}<small>{ride.passenger_phone || 'No phone'}</small></td>
                <td>{ride.pickup_label}<small>{ride.destination}</small></td>
                <td>{money(ride.fare_amount || 0)}</td>
                <td><span className={`mr-status ${ride.status}`}>{statusLabel(ride.status)}</span></td>
                <td>
                  {ride.status === 'requested' && <button type="button" className="mr-small-button" disabled={busy} onClick={() => rideAction(ride.ride_id, 'acceptRide')}>Accept</button>}
                  {ride.status === 'accepted' && <button type="button" className="mr-small-button" disabled={busy} onClick={() => rideAction(ride.ride_id, 'startRide')}>Start</button>}
                  {ride.status === 'cash_confirmation' && <button type="button" className="mr-small-button" disabled={busy} onClick={() => rideAction(ride.ride_id, 'confirmCash')}>Confirm cash</button>}
                  {![ 'requested', 'accepted', 'cash_confirmation' ].includes(ride.status) && <span className="mr-muted">No action</span>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
        </div>
      )}
      {activeTab === 'analytics' && (
        <section id="mr-driver-panel-analytics" className="mr-card" role="tabpanel" aria-labelledby="mr-driver-tab-analytics">
          <div className="mr-section-title">
            <div><h2>Driver analytics</h2><p className="mr-muted">Completed rides, posted Mini Ride earnings, and reward coins from your driver account.</p></div>
          </div>
          <div className="mr-stats mr-driver-analytics">
            <article className="mr-card"><span>Completed trips</span><strong>{Number(dashboard.summary?.totalTrips || 0).toLocaleString()}</strong></article>
            <article className="mr-card"><span>Real-wallet Mini Ride earnings</span><strong>{money(dashboard.summary?.walletEarnings)}</strong></article>
            <article className="mr-card"><span>Bonus balance and wallet history</span><button type="button" className="mr-small-button" onClick={() => setActiveTab('wallet')}>Open Wallet</button><small>View real balance, bonus, coins, and activity</small></article>
            <article className="mr-card"><span>Reward coins earned</span><strong>{Number(dashboard.summary?.coinEarnings || 0).toLocaleString()}</strong></article>
          </div>
          <h3>Completed ride activity</h3>
          {dashboard.rides.some(ride => ride.status === 'completed') ? (
            <div className="mr-table-wrap"><table><thead><tr><th>Completed trip</th><th>Pickup</th><th>Destination</th><th>Fare</th><th>Payment</th></tr></thead><tbody>
              {dashboard.rides.filter(ride => ride.status === 'completed').map(ride => (
                <tr key={ride.ride_id}>
                  <td>{ride.updated_at && !Number.isNaN(new Date(ride.updated_at).getTime()) ? new Date(ride.updated_at).toLocaleString() : 'Completed'}</td>
                  <td>{ride.pickup_label}</td>
                  <td>{ride.destination}</td>
                  <td>{money(ride.fare_amount)}</td>
                  <td>{ride.payment_method || '—'}</td>
                </tr>
              ))}
            </tbody></table></div>
          ) : <p className="mr-muted">Completed ride earnings will appear here after your first trip.</p>}
        </section>
      )}
      {activeTab === 'tracker' && (
        <section id="mr-driver-panel-tracker" className="mr-card" role="tabpanel" aria-labelledby="mr-driver-tab-tracker">
          <div className="mr-section-title">
            <div><h2>Live map tracker</h2><p className="mr-muted">Your location is shared with passengers only while you are online. The map also shows the active ride when one is assigned.</p></div>
            <span className={online ? 'mr-live' : 'mr-count'}>{online ? '● Sharing location' : 'Location sharing off'}</span>
          </div>
          <MiniRideMap
            drivers={online && dashboard.status?.latitude != null && dashboard.status?.longitude != null
              ? [{ ...dashboard.status, full_name: account?.full_name || account?.username || 'You' }]
              : []}
            ride={currentRide}
            height={420}
          />
          {!online && <p className="mr-muted">Go online to show your live location on the tracker.</p>}
        </section>
      )}
      {activeTab === 'wallet' && (
        <section id="mr-driver-panel-wallet" className="mr-card" role="tabpanel" aria-labelledby="mr-driver-tab-wallet">
          <Wallet compact title="Driver wallet" showAgentRequests={false} />
        </section>
      )}
    </main>
  )
}

export default DriverPortal
