import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import MiniRideMap from '../components/MiniRideMap'
import { miniRideAPI, socialAPI } from '../services/api'
import { getServicePaymentProviders } from '../utils/servicePaymentSettings'
import { estimateMiniRideFare, geocodeMiniRideDestination, getMiniRideCurrentDistance, getMiniRideNavigationUrl, getMiniRideRoadRoute } from '../utils/miniRideRouting'
import './MiniRidePages.css'

const activeStatuses = new Set(['requested', 'accepted', 'in_progress', 'awaiting_payment', 'payment_review', 'cash_confirmation'])
const money = value => `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const statusLabel = value => String(value || '').replaceAll('_', ' ')
const errorText = error => error?.message || 'Mini Ride could not be loaded. Please try again.'

function useAccount() {
  try {
    return JSON.parse(localStorage.getItem('userData') || 'null')
  } catch {
    return null
  }
}

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device does not support location sharing.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      locationError => reject(new Error(
        locationError.code === locationError.PERMISSION_DENIED
          ? 'Location permission was denied. Enable it in your browser settings to request a ride.'
          : 'Could not get your location. Check your device location settings and try again.'
      )),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    )
  })
}

function MiniRidePage() {
  const account = useAccount()
  const [rides, setRides] = useState([])
  const [drivers, setDrivers] = useState([])
  const [pickup, setPickup] = useState(null)
  const [form, setForm] = useState({ passengerName: account?.full_name || account?.username || '', passengerPhone: account?.phone || '', destination: '', loadKg: '', driverId: '' })
  const [destinationLocation, setDestinationLocation] = useState(null)
  const [roadRoute, setRoadRoute] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [rideSettings, setRideSettings] = useState(null)
  const [providers, setProviders] = useState([])
  const [walletBalance, setWalletBalance] = useState(null)
  const [paymentProvider, setPaymentProvider] = useState('')
  const [paymentReference, setPaymentReference] = useState('')
  const [shareLocation, setShareLocation] = useState(false)
  const previousRideStatuses = useRef({})
  const [showRideThanks, setShowRideThanks] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (showError = true) => {
    try {
      const [rideResponse, driverResponse] = await Promise.all([
        miniRideAPI.getMyRides(),
        miniRideAPI.getAvailableDrivers(),
      ])
      const nextRides = rideResponse.data || []
      if (nextRides.some(ride =>
        previousRideStatuses.current[ride.ride_id] === 'cash_confirmation' &&
        ride.status === 'completed' && ride.payment_method === 'Cash'
      )) setShowRideThanks(true)
      previousRideStatuses.current = Object.fromEntries(nextRides.map(ride => [ride.ride_id, ride.status]))
      setRides(nextRides)
      setDrivers(driverResponse.data || [])
      setError('')
    } catch (loadError) {
      if (showError) setError(errorText(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(false), 3000)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    getServicePaymentProviders()
      .then(items => setProviders(items.filter(item => item.serviceEnabled !== false)))
      .catch(providerError => setError(`Could not load payment providers: ${errorText(providerError)}`))
    socialAPI.getWallet()
      .then(response => setWalletBalance(Number(response.data?.availableBalance)))
      .catch(walletError => setError(`Could not load your wallet balance: ${errorText(walletError)}`))
    miniRideAPI.getSettings()
      .then(response => setRideSettings(response.data))
      .catch(settingsError => setError(`Could not load fare settings: ${errorText(settingsError)}`))
  }, [])

  useEffect(() => {
    if (!pickup || form.destination.trim().length < 3) {
      setDestinationLocation(null)
      setRoadRoute(null)
      setRouteLoading(false)
      setRouteError(pickup ? '' : 'Set your pickup location to preview a road route.')
      return undefined
    }
    const controller = new AbortController()
    setDestinationLocation(null)
    setRoadRoute(null)
    setRouteLoading(true)
    setRouteError('')
    const timer = window.setTimeout(async () => {
      try {
        const destination = await geocodeMiniRideDestination(form.destination, controller.signal)
        const route = await getMiniRideRoadRoute(pickup, destination, controller.signal)
        setDestinationLocation(destination)
        setRoadRoute(route)
      } catch (routeLookupError) {
        if (routeLookupError.name !== 'AbortError') {
          setDestinationLocation(null)
          setRoadRoute(null)
          setRouteError(routeLookupError.message || 'Could not calculate the road route.')
        }
      } finally {
        if (!controller.signal.aborted) setRouteLoading(false)
      }
    }, 600)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [form.destination, pickup])

  const currentRide = rides.find(ride => activeStatuses.has(ride.status)) || null
  const visibleDrivers = currentRide
    ? drivers.filter(driver => String(driver.user_id) === String(currentRide.driver_user_id || ''))
    : drivers
  const locationRequiredRide = currentRide && ['accepted', 'in_progress'].includes(currentRide.status)

  useEffect(() => {
    setShareLocation(Boolean(locationRequiredRide))
  }, [locationRequiredRide, currentRide?.ride_id])

  useEffect(() => {
    if (!shareLocation || !locationRequiredRide || !navigator.geolocation) return undefined
    let active = true
    let watchId
    let latest = null
    let lastSentAt = 0
    const sendLocation = () => {
      if (!active || !latest || Date.now() - lastSentAt < 8000) return
      lastSentAt = Date.now()
      miniRideAPI.updateLocation(currentRide.ride_id, latest).catch(locationError => {
        if (active) setError(`Live location update failed: ${errorText(locationError)}`)
      })
    }
    watchId = navigator.geolocation.watchPosition(
      position => {
        latest = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        sendLocation()
      },
      locationError => {
        if (active) {
          setShareLocation(false)
          setError(locationError.code === locationError.PERMISSION_DENIED
            ? 'Location access was denied. Allow location in your browser to share the trip live.'
            : 'Your location could not be updated.')
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
    const heartbeat = window.setInterval(sendLocation, 20000)
    return () => {
      active = false
      navigator.geolocation.clearWatch(watchId)
      window.clearInterval(heartbeat)
    }
  }, [shareLocation, locationRequiredRide, currentRide?.ride_id])

  const requestRide = async event => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const location = pickup || await getCurrentLocation()
      if (!pickup) setPickup(location)
      if (!destinationLocation || !roadRoute) {
        throw new Error('Wait for a valid road route to the destination before requesting the ride.')
      }
      const response = await miniRideAPI.createRide({
        ...form,
        loadKg: Number(form.loadKg || 0),
        driverId: form.driverId || undefined,
        pickupLabel: 'Current location',
        destinationLatitude: destinationLocation.latitude,
        destinationLongitude: destinationLocation.longitude,
        routeDistanceKm: roadRoute.distanceKm,
        ...location,
      })
      setNotice('Your ride request was sent. We will update the status here.')
      setForm(previous => ({ ...previous, destination: '', loadKg: '', driverId: '' }))
      await load()
      if (response.data) setRides(previous => [response.data, ...previous.filter(ride => ride.ride_id !== response.data.ride_id)])
    } catch (requestError) {
      setError(errorText(requestError))
    } finally {
      setBusy(false)
    }
  }

  const refreshPickup = async () => {
    setBusy(true)
    setError('')
    try {
      setPickup(await getCurrentLocation())
    } catch (locationError) {
      setError(errorText(locationError))
    } finally {
      setBusy(false)
    }
  }

  const submitPayment = async method => {
    if (!currentRide) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await miniRideAPI.payRide(currentRide.ride_id, method === 'wallet'
        ? { method }
        : method === 'cash'
          ? { method }
          : { method: paymentProvider, reference: paymentReference })
      setNotice(method === 'cash'
        ? 'Cash payment is waiting for your driver to confirm receipt.'
        : method === 'wallet'
          ? 'Wallet payment completed successfully.'
          : 'Payment details submitted for Root verification.')
      setPaymentReference('')
      await load()
    } catch (paymentError) {
      setError(errorText(paymentError))
    } finally {
      setBusy(false)
    }
  }

  const finishRide = async () => {
    if (!currentRide) return
    setBusy(true)
    setError('')
    try {
      await miniRideAPI.finishRide(currentRide.ride_id)
      setShareLocation(false)
      setNotice('Trip finished. Review the fare and choose how to pay.')
      await load()
    } catch (finishError) {
      setError(errorText(finishError))
    } finally {
      setBusy(false)
    }
  }

  const requestLocationShare = async () => {
    setBusy(true)
    setError('')
    try {
      await getCurrentLocation()
      setShareLocation(true)
    } catch (locationError) {
      setError(errorText(locationError))
    } finally {
      setBusy(false)
    }
  }

  const payable = currentRide?.status === 'awaiting_payment'
  const providerNames = useMemo(() => providers.map(provider => provider.name || provider.id), [providers])
  const selectedProvider = providers.find(provider => (provider.name || provider.id) === paymentProvider)
  const providerAccount = selectedProvider?.accounts?.find(item => item.serviceEnabled !== false) || selectedProvider?.accounts?.[0]
  const activeRideNavigation = currentRide && getMiniRideNavigationUrl(
    { latitude: currentRide.pickup_latitude, longitude: currentRide.pickup_longitude },
    { latitude: currentRide.destination_latitude, longitude: currentRide.destination_longitude }
  )
  const activeRideEstimatedFare = currentRide && estimateMiniRideFare(
    getMiniRideCurrentDistance(currentRide),
    rideSettings,
    currentRide.load_kg
  )

  if (!localStorage.getItem('authToken') || !account) {
    return <main className="mini-ride-page"><section className="mr-card mr-login"><h1>Mini Ride</h1><p>Sign in to request a ride and track your trip.</p><Link to="/login" className="mr-primary">Sign in</Link></section></main>
  }
  if (['root', 'admin', 'agent', 'driver'].includes(String(account.role || '').toLowerCase())) {
    return <main className="mini-ride-page"><section className="mr-card mr-login"><h1>Mini Ride</h1><p>This account cannot request a passenger ride.</p><Link to={account.role === 'driver' ? '/driver' : '/root/dashboard'} className="mr-primary">Open your portal</Link></section></main>
  }

  return (
    <main className="mini-ride-page">
      {showRideThanks && (
        <div className="mr-modal-backdrop" role="presentation">
          <section className="mr-completion-modal" role="dialog" aria-modal="true" aria-labelledby="mr-thanks-title">
            <span aria-hidden="true">✓</span><h2 id="mr-thanks-title">Ride complete</h2>
            <p>Your driver confirmed the cash payment. Thank you for riding with REDSEA!</p>
            <button type="button" className="mr-primary" onClick={() => setShowRideThanks(false)}>Done</button>
          </section>
        </div>
      )}
      <header className="mr-heading"><div><span className="mr-eyebrow">REDSEA mobility</span><h1>Mini Ride</h1><p>Request a nearby driver and follow your trip live.</p></div><span className="mr-live"><i /> Updates every few seconds</span></header>
      {error && <div className="mr-alert mr-error" role="alert">{error}</div>}
      {notice && <div className="mr-alert mr-success" role="status">{notice}</div>}
      <div className="mr-layout">
        <section className="mr-card">
          <h2>Available drivers <small>{drivers.length} online</small></h2>
          <MiniRideMap
            drivers={visibleDrivers}
            ride={currentRide}
            overlay={currentRide && rideSettings ? (
              <>
                <strong>{money(estimateMiniRideFare(getMiniRideCurrentDistance(currentRide), rideSettings, currentRide.load_kg))}</strong>
                <span>{money(rideSettings.fare_per_km)} / km · {getMiniRideCurrentDistance(currentRide).toFixed(2)} km counted</span>
                <span>{currentRide.status === 'awaiting_payment'
                  ? 'Final amount due'
                  : currentRide.status === 'in_progress'
                    ? 'Live trip amount'
                    : 'Estimated amount'}
                </span>
              </>
            ) : null}
            routePreview={!currentRide && pickup && roadRoute ? {
              coordinates: roadRoute.coordinates,
              origin: pickup,
              destination: { ...destinationLocation, label: form.destination },
            } : null}
            height={320}
          />
          <div className="mr-driver-list" aria-label="Online drivers">
            {drivers.map(driver => (
              <button
                type="button"
                key={driver.user_id}
                className={`mr-driver-card ${form.driverId === driver.user_id ? 'selected' : ''}`}
                onClick={() => setForm(previous => ({ ...previous, driverId: previous.driverId === driver.user_id ? '' : driver.user_id }))}
              >
                <span className="mr-driver-indicator" />
                <span><b>{driver.full_name}</b><small>Online · Sharing location</small></span>
                <span aria-hidden="true">{form.driverId === driver.user_id ? '✓' : '›'}</span>
              </button>
            ))}
            {!drivers.length && <p className="mr-muted">No drivers are currently sharing their location. You can still request a ride.</p>}
          </div>
          <p className="mr-privacy">Your location is shared only after you request it, and with your consent during an active trip.</p>
        </section>
        <section className="mr-card">
          {currentRide ? (
            <>
              <div className="mr-section-title"><h2>Your ride</h2><span className={`mr-status ${currentRide.status}`}>{currentRide.ride_paused_at ? 'paused' : statusLabel(currentRide.status)}</span></div>
              <div className="mr-ride-summary">
                <p><b>Destination</b><span>{currentRide.destination}</span></p>
                <p><b>Driver</b><span>{currentRide.driver_full_name || 'Waiting for driver'}</span></p>
                <p><b>Rate</b><span>{rideSettings ? `${money(rideSettings.fare_per_km)} / km` : 'Loading fare rate'}</span></p>
                <p><b>Road route</b><span>{Number(currentRide.route_distance_km || currentRide.distance_km || 0).toFixed(2)} km</span></p>
                <p><b>Counted distance</b><span>{getMiniRideCurrentDistance(currentRide).toFixed(2)} km</span></p>
                <p><b>Fare rate</b><span>{rideSettings ? `${money(rideSettings.fare_per_km)} / km` : 'Loading fare rate'}</span></p>
                {currentRide.ride_paused_at && <p><b>Trip update</b><span>Paused by driver · fare meter stopped</span></p>}
                {activeRideEstimatedFare !== null && activeRideEstimatedFare !== false && <p><b>{currentRide.status === 'awaiting_payment' ? 'Amount to pay' : currentRide.status === 'in_progress' ? 'Current amount' : 'Estimated total'}</b><span>{money(activeRideEstimatedFare)}</span></p>}
                {currentRide.fare_amount > 0 && <p><b>Final trip fare</b><span>{money(currentRide.fare_amount)}</span></p>}
                {Number(currentRide.distance_km || 0) > 0 && <p><b>Live tracked distance</b><span>{Number(currentRide.distance_km).toFixed(2)} km</span></p>}
                {activeRideNavigation && <p><b>Navigation</b><span><a href={activeRideNavigation} target="_blank" rel="noopener noreferrer">Open turn-by-turn map</a></span></p>}
                {currentRide.payment_status === 'pending' && <p><b>Payment</b><span>Waiting for Root review</span></p>}
              </div>
              {locationRequiredRide && (
                <button type="button" className="mr-secondary" disabled={busy || shareLocation} onClick={requestLocationShare}>
                  {shareLocation ? 'Live location sharing enabled' : 'Allow live trip location'}
                </button>
              )}
              {currentRide.status === 'in_progress' && <button type="button" className="mr-primary mr-wide" disabled={busy} onClick={finishRide}>Finish ride</button>}
              {currentRide.status === 'requested' && <p className="mr-muted">Your request is waiting for a driver.</p>}
              {payable && (
                <div className="mr-payment">
                  <h3>Choose payment · {money(currentRide.fare_amount)}</h3>
                  <button type="button" className="mr-primary mr-wide" disabled={busy || (walletBalance !== null && walletBalance < Number(currentRide.fare_amount))} onClick={() => submitPayment('wallet')}>
                    Pay from REDSEA Wallet · {walletBalance === null ? 'Balance loading' : `${money(walletBalance)} available`}
                  </button>
                  <button type="button" className="mr-secondary mr-wide" disabled={busy} onClick={() => submitPayment('cash')}>Pay cash to driver</button>
                  <label>Other payment provider
                    <select value={paymentProvider} onChange={event => setPaymentProvider(event.target.value)}>
                      <option value="">Choose provider</option>
                      {providerNames.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                  {providerAccount && (
                    <div className="mr-provider-instructions">
                      <b>{providerAccount.accountName || selectedProvider.name || selectedProvider.id}</b>
                      {providerAccount.bankName && <span>Bank: {providerAccount.bankName}</span>}
                      {providerAccount.accountNumber && <span>Account: {providerAccount.accountNumber}</span>}
                      {providerAccount.phone && <span>Phone: {providerAccount.phone}</span>}
                      <small>After transferring, enter the transaction reference below. Root will verify the payment.</small>
                    </div>
                  )}
                  <label>Payment reference
                    <input value={paymentReference} onChange={event => setPaymentReference(event.target.value)} placeholder="Transaction reference" maxLength={180} />
                  </label>
                  <button type="button" className="mr-secondary mr-wide" disabled={busy || !paymentProvider || !paymentReference.trim()} onClick={() => submitPayment('provider')}>Submit provider payment</button>
                </div>
              )}
              {currentRide.status === 'cash_confirmation' && <p className="mr-muted">Waiting for the driver to confirm the cash payment.</p>}
            </>
          ) : (
            <form className="mr-form" onSubmit={requestRide}>
              <h2>Request a ride</h2>
              <button type="button" className="mr-location-button" onClick={refreshPickup} disabled={busy}>
                {pickup ? '✓ Pickup location ready — update location' : '◎ Allow location and set pickup'}
              </button>
              {pickup && <span className="mr-location-coords">Pickup: {pickup.latitude.toFixed(5)}, {pickup.longitude.toFixed(5)}</span>}
              <label>From (pickup)<input value={pickup ? 'Current location' : 'Set your current location above'} readOnly aria-label="Pickup location" /></label>
              <label>To (destination)<input required minLength={3} maxLength={250} value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} placeholder="Address, area, or landmark" /></label>
              {routeLoading && <p className="mr-muted" role="status">Finding destination and calculating the road route…</p>}
              {routeError && !routeLoading && <p className="mr-alert mr-error" role="alert">{routeError}</p>}
              {roadRoute && destinationLocation && <div className="mr-route-estimate" role="status">
                <strong>Road route: {roadRoute.distanceKm.toFixed(2)} km</strong>
                <span>Rate: {rideSettings ? `${money(rideSettings.fare_per_km)} per km` : 'Loading per-kilometre rate…'}</span>
                <span>Estimated travel time: {Math.max(1, Math.round(roadRoute.durationMinutes))} min</span>
                <span>{rideSettings
                  ? `Estimated total: ${money(estimateMiniRideFare(roadRoute.distanceKm, rideSettings, form.loadKg))}`
                  : 'Fare rates are loading.'}</span>
                <a href={getMiniRideNavigationUrl(pickup, destinationLocation)} target="_blank" rel="noopener noreferrer">Open turn-by-turn navigation</a>
                <small>Route follows available roads. Final distance and fare use the driver's trip GPS trace.</small>
              </div>}
              <label>Passenger name<input required maxLength={120} value={form.passengerName} onChange={event => setForm({ ...form, passengerName: event.target.value })} /></label>
              <label>Phone number<input required type="tel" maxLength={24} value={form.passengerPhone} onChange={event => setForm({ ...form, passengerPhone: event.target.value })} /></label>
              <label>Load weight (kg) · optional<input type="number" min="0" max="100000" value={form.loadKg} onChange={event => setForm({ ...form, loadKg: event.target.value })} placeholder="No load" /></label>
              <label>Choose a driver <select value={form.driverId} onChange={event => setForm({ ...form, driverId: event.target.value })}><option value="">Let a driver accept my request</option>{drivers.map(driver => <option key={driver.user_id} value={driver.user_id}>{driver.full_name}</option>)}</select></label>
              <button type="submit" className="mr-primary mr-wide" disabled={busy || routeLoading || !roadRoute || !rideSettings}>{busy ? 'Sending request…' : 'Request ride'}</button>
              <p className="mr-privacy">The live map shows road navigation, your pickup, destination, and the driver's shared trip trace.</p>
            </form>
          )}
        </section>
      </div>
      <section className="mr-card mr-history">
        <h2>Ride history</h2>
        {loading && !rides.length ? <p className="mr-muted">Loading ride history…</p> : rides.length === 0 ? <p className="mr-muted">Your ride history will appear here.</p> : (
          <div className="mr-table-wrap"><table><thead><tr><th>Destination</th><th>Driver</th><th>Status</th><th>Rate / road distance</th><th>Estimated / final fare</th><th>Date</th></tr></thead><tbody>
            {rides.map(ride => <tr key={ride.ride_id}><td>{ride.destination}</td><td>{ride.driver_full_name || 'Unassigned'}</td><td><span className={`mr-status ${ride.status}`}>{statusLabel(ride.status)}</span></td><td>{rideSettings ? `${money(rideSettings.fare_per_km)} / km` : '—'}<small>{Number(ride.route_distance_km || ride.distance_km || 0).toFixed(2)} km</small></td><td>{money(estimateMiniRideFare(ride.route_distance_km || ride.distance_km || 0, rideSettings, ride.load_kg) || 0)}<small>{ride.fare_amount ? `Final: ${money(ride.fare_amount)}` : 'Estimated fare'}</small></td><td>{ride.created_at ? new Date(`${String(ride.created_at).replace(' ', 'T')}Z`).toLocaleString() : '—'}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </main>
  )
}

export default MiniRidePage
