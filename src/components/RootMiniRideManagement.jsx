import { useCallback, useEffect, useMemo, useState } from 'react'
import MiniRideMap from './MiniRideMap'
import { rootAPI } from '../services/api'
import { estimateMiniRideFare, getMiniRideCurrentDistance } from '../utils/miniRideRouting'
import '../pages/MiniRidePages.css'

const money = value => `ETB ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const statusLabel = value => String(value || '').replaceAll('_', ' ')
const SETTING_FIELDS = [
  ['base_fare', 'Base fare (ETB)', 'number'],
  ['fare_per_km', 'Fare per kilometre (ETB)', 'number'],
  ['fare_per_ton', 'Load fare per tonne (ETB)', 'number'],
  ['driver_commission_percent', 'Driver share (%)', 'number'],
  ['passenger_coin_reward', 'Passenger coins per completed ride', 'number'],
  ['driver_coin_reward', 'Driver coins per completed ride', 'number'],
]

function RootMiniRideManagement() {
  const [data, setData] = useState({ rides: [], drivers: [], settings: {}, summary: {} })
  const [driverApplications, setDriverApplications] = useState([])
  const [selectedRideId, setSelectedRideId] = useState('')
  const [selectedDriverFilter, setSelectedDriverFilter] = useState('all')
  const [selectedApplicationId, setSelectedApplicationId] = useState('')
  const [assignment, setAssignment] = useState({})
  const [settings, setSettings] = useState({})
  const [walletAdjustment, setWalletAdjustment] = useState({
    driverId: '',
    asset: 'real',
    direction: 'credit',
    amount: '',
    description: '',
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pdfViewer, setPdfViewer] = useState(null)

  const load = useCallback(async (showError = true) => {
    try {
      const [miniRideResponse, driverApplicationsResponse] = await Promise.all([
        rootAPI.getMiniRides(),
        rootAPI.getDriverApplications().catch(error => {
          if (error?.status === 404) return { data: [] }
          throw error
        }),
      ])
      const next = miniRideResponse.data || { rides: [], drivers: [], settings: {}, summary: {} }
      const applications = driverApplicationsResponse.data || []
      setData(next)
      setDriverApplications(applications)
      setSettings(previous => Object.keys(previous).length ? previous : next.settings || {})
      setWalletAdjustment(previous => ({
        ...previous,
        driverId: next.drivers?.some(driver => driver.user_id === previous.driverId)
          ? previous.driverId
          : next.drivers?.[0]?.user_id || '',
      }))
      setSelectedRideId(previous => previous || next.rides?.[0]?.ride_id || '')
      setSelectedApplicationId(previous => previous || applications[0]?.application_id || '')
      setError('')
    } catch (loadError) {
      if (showError) setError(loadError.message || 'Could not load Mini Ride management data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(false), 3000)
    return () => window.clearInterval(timer)
  }, [load])

  const selectedRide = data.rides.find(ride => ride.ride_id === selectedRideId) || null
  const selectedApplication = driverApplications.find(app => app.application_id === selectedApplicationId) || driverApplications[0] || null
  const onlineDrivers = data.drivers.filter(driver => driver.is_online === 1)
  const liveRides = data.rides.filter(ride => ['requested', 'accepted', 'in_progress', 'awaiting_payment', 'payment_review', 'cash_confirmation'].includes(ride.status))
  const filteredLiveRides = selectedDriverFilter === 'all'
    ? liveRides
    : liveRides.filter(ride => String(ride.driver_user_id || '') === selectedDriverFilter)
  const filteredLiveDrivers = selectedDriverFilter === 'all'
    ? onlineDrivers
    : onlineDrivers.filter(driver => String(driver.user_id) === selectedDriverFilter)
  const selectedRideEstimate = selectedRide && estimateMiniRideFare(
    getMiniRideCurrentDistance(selectedRide),
    data.settings,
    selectedRide.load_kg
  )

  const runAction = async action => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await load()
      setNotice('Mini Ride management updated.')
    } catch (actionError) {
      setError(actionError.message || 'Mini Ride action failed.')
    } finally {
      setBusy(false)
    }
  }

  const saveSettings = event => {
    event.preventDefault()
    runAction(async () => {
      const saved = await rootAPI.saveMiniRideSettings(settings)
      setSettings(saved.data || settings)
    })
  }

  const adjustDriverWallet = event => {
    event.preventDefault()
    const { driverId, asset, direction, amount, description } = walletAdjustment
    if (!driverId) {
      setError('Choose a driver before adjusting a wallet balance.')
      return
    }
    runAction(async () => {
      await rootAPI.adjustMiniRideDriverWallet(driverId, {
        asset,
        direction,
        amount: Number(amount),
        description: description.trim(),
      })
      setWalletAdjustment(current => ({ ...current, amount: '', description: '' }))
    })
  }

  const assignDriver = ride => {
    const driverId = assignment[ride.ride_id] || ''
    if (!driverId) {
      setError('Choose an online driver before assigning a ride.')
      return
    }
    runAction(() => rootAPI.assignMiniRideDriver(ride.ride_id, driverId))
  }

  const reviewPayment = (ride, status) => runAction(() => rootAPI.reviewMiniRidePayment(ride.ride_id, status))
  const finishRide = ride => runAction(() => rootAPI.finishMiniRide(ride.ride_id))

  const reviewApplication = (application, status) => runAction(async () => {
    const response = await rootAPI.reviewDriverApplication(application.application_id, status, '')
    if (response?.data?.application_id) setSelectedApplicationId(response.data.application_id)
  })

  const openDocument = (label, source) => {
    if (!source) {
      setError('This document is not available for preview.')
      return
    }
    setPdfViewer({ label, source })
  }

  const downloadDocument = (label, source) => {
    if (!source) {
      setError('This document is not available for download.')
      return
    }
    const link = document.createElement('a')
    link.href = source
    link.download = `${String(label || 'document').replace(/\s+/g, '-').toLowerCase()}.pdf`
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()
  }

  return (
    <div className="root-mini-ride">
      {error && <div className="mr-alert mr-error" role="alert">{error}</div>}
      {notice && <div className="mr-alert mr-success" role="status">{notice}</div>}
      <div className="mr-stats">
        <article className="mr-card"><span>Total ride requests</span><strong>{data.summary.rideCount || 0}</strong></article>
        <article className="mr-card"><span>Active rides</span><strong>{data.summary.activeCount || 0}</strong></article>
        <article className="mr-card"><span>Pending payment reviews</span><strong>{data.summary.pendingPaymentCount || 0}</strong></article>
        <article className="mr-card"><span>Completed fares</span><strong>{money(data.summary.completedFares)}</strong></article>
        <article className="mr-card"><span>Platform share</span><strong>{money(data.summary.platformEarnings)}</strong></article>
        <article className="mr-card"><span>Driver wallet payouts</span><strong>{money(data.summary.driverWalletPayouts)}</strong></article>
      </div>
      <section className="mr-card">
        <div className="mr-section-title">
          <div><h2>Live drivers and ride tracking</h2><p className="mr-muted">Active passenger requests, shared driver locations, and recorded trip paths update automatically.</p></div>
          <div className="mr-live-map-tools">
            <label>Filter by driver
              <select value={selectedDriverFilter} onChange={event => setSelectedDriverFilter(event.target.value)}>
                <option value="all">All drivers</option>
                {data.drivers.map(driver => <option key={driver.user_id} value={driver.user_id}>{driver.full_name}</option>)}
              </select>
            </label>
            <span className="mr-count">{filteredLiveDrivers.length} online · {filteredLiveRides.length} rides</span>
          </div>
        </div>
        <MiniRideMap
          drivers={filteredLiveDrivers}
          rides={filteredLiveRides}
          overlay={selectedRide && data.settings && selectedRideEstimate !== null ? (
            <>
              <strong>{money(selectedRideEstimate)}</strong>
              <span>{money(data.settings.fare_per_km)} / km · {getMiniRideCurrentDistance(selectedRide).toFixed(2)} km counted</span>
              <span>{selectedRide.ride_paused_at ? 'Trip paused · fare meter stopped' : selectedRide.status === 'in_progress' ? 'Live trip amount' : selectedRide.status === 'awaiting_payment' ? 'Final amount due' : 'Estimated amount'}</span>
            </>
          ) : null}
          height={420}
        />
        {!filteredLiveRides.length && <p className="mr-muted">No active passenger rides match this driver filter. Online drivers remain visible above.</p>}
        {selectedRide && <div className="mr-ride-summary">
          <p><b>Selected trip</b><span>{selectedRide.passenger_name || selectedRide.passenger_username} · {selectedRide.destination}{selectedRide.ride_paused_at ? ' · PAUSED' : ''}</span></p>
          <p><b>Fare rate</b><span>{money(data.settings?.fare_per_km)} / km</span></p>
          <p><b>Road route</b><span>{Number(selectedRide.route_distance_km || selectedRide.distance_km || 0).toFixed(2)} km</span></p>
          <p><b>Counted distance</b><span>{getMiniRideCurrentDistance(selectedRide).toFixed(2)} km</span></p>
          {selectedRideEstimate !== null && selectedRideEstimate !== false && <p><b>{selectedRide.status === 'in_progress' ? 'Current amount' : selectedRide.status === 'awaiting_payment' ? 'Amount due' : 'Estimated total'}</b><span>{money(selectedRideEstimate)}</span></p>}
          {selectedRide.fare_amount > 0 && <p><b>Final fare</b><span>{money(selectedRide.fare_amount)}</span></p>}
          {selectedRide.status === 'in_progress' && <button type="button" className="mr-primary" disabled={busy} onClick={() => finishRide(selectedRide)}>Finish trip · {money(selectedRideEstimate || 0)}</button>}
        </div>}
      </section>
      <section className="mr-card">
        <div className="mr-section-title"><div><h2>Driver onboarding requests</h2><p className="mr-muted">Review each driver's personal information, documents, and agreement before allowing access to the driver portal.</p></div><span className="mr-count">{driverApplications.length}</span></div>
        {driverApplications.length === 0 ? <p className="mr-muted">No driver onboarding applications are waiting for review.</p> : (
          <div className="mr-table-wrap"><table><thead><tr><th>Driver</th><th>Phone</th><th>National ID</th><th>Status</th><th>Submitted</th><th>Review</th></tr></thead><tbody>
            {driverApplications.map(application => (
              <tr key={application.application_id} className={selectedApplicationId === application.application_id ? 'mr-row-selected' : ''}>
                <td>{application.full_name || application.username || 'Driver'}<small>{application.email || 'No email'}</small></td>
                <td>{application.phone || 'No phone'}</td>
                <td>{application.national_id_number || 'Not provided'}</td>
                <td><span className={`mr-status ${application.status}`}>{statusLabel(application.status)}</span></td>
                <td>{application.created_at ? new Date(application.created_at).toLocaleString() : '—'}</td>
                <td><button type="button" className="mr-small-button" onClick={() => setSelectedApplicationId(application.application_id)}>Open info</button></td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      {selectedApplication && (
        <section className="mr-card">
          <div className="mr-section-title"><div><h2>{selectedApplication.full_name} · Driver verification</h2><p className="mr-muted">Review the application and documents before approving or rejecting access.</p></div><span className={`mr-status ${selectedApplication.status}`}>{statusLabel(selectedApplication.status)}</span></div>
          <div className="mr-application-grid">
            <article>
              <p><strong>Phone:</strong> {selectedApplication.phone || '—'}</p>
              <p><strong>Email:</strong> {selectedApplication.email || '—'}</p>
              <p><strong>National ID:</strong> {selectedApplication.national_id_number || '—'}</p>
              <p><strong>Address:</strong> {selectedApplication.address || '—'}</p>
              <p><strong>City:</strong> {selectedApplication.city || '—'}</p>
            </article>
            <div className="mr-doc-grid">
              {[
                ['National ID front', selectedApplication.national_id_front],
                ['National ID back', selectedApplication.national_id_back],
                ['Driver licence', selectedApplication.driver_license],
                ['Collateral proof', selectedApplication.collateral],
              ].map(([label, source]) => (
                <div key={label} className="mr-doc-card">
                  <strong>{label}</strong>
                  <div className="mr-doc-actions">
                    <button type="button" className="mr-small-button" disabled={!source} onClick={() => openDocument(label, source)}>View PDF</button>
                    <button type="button" className="mr-small-button" disabled={!source} onClick={() => downloadDocument(label, source)}>Download</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mr-actions">
            <button type="button" className="mr-primary" disabled={busy || selectedApplication.status === 'approved'} onClick={() => reviewApplication(selectedApplication, 'approved')}>Approve driver</button>
            <button type="button" className="mr-small-button danger" disabled={busy || selectedApplication.status === 'rejected'} onClick={() => reviewApplication(selectedApplication, 'rejected')}>Reject driver</button>
          </div>
        </section>
      )}
      <section className="mr-card">
        <div className="mr-section-title"><div><h2>Ride requests and history</h2><p className="mr-muted">Configured rate: {money(data.settings?.fare_per_km)} per road kilometre. Ride status and GPS fare updates refresh automatically without reloading.</p></div><span className="mr-count">{data.rides.length}</span></div>
        {loading && !data.rides.length ? <p className="mr-muted">Loading Mini Ride activity…</p> : !data.rides.length ? <p className="mr-muted">No ride requests have been submitted.</p> : (
          <div className="mr-table-wrap"><table><thead><tr><th>Passenger / pickup</th><th>Destination</th><th>Driver</th><th>Status / payment</th><th>Distance / fare</th><th>Manage</th></tr></thead><tbody>
            {data.rides.map(ride => (
              <tr key={ride.ride_id} className={selectedRideId === ride.ride_id ? 'mr-row-selected' : ''} onClick={() => setSelectedRideId(ride.ride_id)}>
                <td>{ride.passenger_name || ride.passenger_username}<small>{ride.pickup_label} · {ride.passenger_phone}</small></td>
                <td>{ride.destination}</td>
                <td>{ride.driver_full_name || 'Unassigned'}{ride.driver_phone && <small>{ride.driver_phone}</small>}</td>
                <td><span className={`mr-status ${ride.status}`}>{ride.ride_paused_at ? 'paused' : statusLabel(ride.status)}</span><small>{ride.payment_method || 'No payment'} · {ride.payment_status}</small></td>
                <td>{Number(ride.route_distance_km || ride.distance_km || 0).toFixed(2)} km road route<small>{money(data.settings?.fare_per_km)} / km</small><small>{money(estimateMiniRideFare(getMiniRideCurrentDistance(ride), data.settings, ride.load_kg) || 0)} {ride.status === 'in_progress' ? 'current' : 'estimated'} · {ride.fare_amount ? `${money(ride.fare_amount)} final` : 'fare pending'}</small></td>
                <td onClick={event => event.stopPropagation()}>
                  {['requested', 'accepted'].includes(ride.status) && (
                    <div className="mr-manage-row"><select aria-label={`Assign driver for ${ride.destination}`} value={assignment[ride.ride_id] || ''} onChange={event => setAssignment(previous => ({ ...previous, [ride.ride_id]: event.target.value }))}><option value="">Select online driver</option>{onlineDrivers.map(driver => <option value={driver.user_id} key={driver.user_id}>{driver.full_name}</option>)}</select><button type="button" className="mr-small-button" disabled={busy} onClick={() => assignDriver(ride)}>Assign</button></div>
                  )}
                  {ride.status === 'payment_review' && <div className="mr-manage-row"><button type="button" className="mr-small-button" disabled={busy} onClick={() => reviewPayment(ride, 'approved')}>Approve</button><button type="button" className="mr-small-button danger" disabled={busy} onClick={() => reviewPayment(ride, 'rejected')}>Reject</button></div>}
                  {ride.status === 'in_progress' && <button type="button" className="mr-small-button" disabled={busy} onClick={() => finishRide(ride)}>Finish · {money(estimateMiniRideFare(getMiniRideCurrentDistance(ride), data.settings, ride.load_kg) || 0)}</button>}
                  {!['requested', 'accepted', 'payment_review'].includes(ride.status) && <button type="button" className="mr-small-button" onClick={() => setSelectedRideId(ride.ride_id)}>Track</button>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </section>
      <section className="mr-card">
        <div className="mr-section-title"><h2>Fare and reward settings</h2><span className="mr-muted">Applies to new fare calculations and completed-ride rewards.</span></div>
        <form className="mr-settings-form" onSubmit={saveSettings}>
          {SETTING_FIELDS.map(([key, label, type]) => (
            <label key={key}>{label}<input required type={type} min="0" max={key.includes('commission') ? '100' : undefined} step={key.includes('coin') ? '1' : '0.01'} value={settings[key] ?? ''} onChange={event => setSettings(previous => ({ ...previous, [key]: event.target.value }))} /></label>
          ))}
          <button type="submit" className="mr-primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        </form>
      </section>
      <section className="mr-card">
        <div className="mr-section-title">
          <div><h2>Driver wallet management</h2><p className="mr-muted">Review real, bonus, and coin balances, then record a reasoned wallet credit or deduction.</p></div>
        </div>
        {data.drivers.length ? (
          <>
            <div className="mr-stats mr-driver-wallet-balances">
              {[
                ['Real balance', 'real_balance', ' ETB'],
                ['Bonus balance', 'bonus_balance', ' ETB'],
                ['Coin balance', 'coin_balance', ' coins'],
              ].map(([label, key, suffix]) => {
                const driver = data.drivers.find(item => item.user_id === walletAdjustment.driverId)
                return <article className="mr-card" key={key}><span>{label}{driver ? ` · ${driver.full_name}` : ''}</span><strong>{Number(driver?.[key] || 0).toLocaleString(undefined, { minimumFractionDigits: key === 'coin_balance' ? 0 : 2, maximumFractionDigits: key === 'coin_balance' ? 0 : 2 })}{suffix}</strong></article>
              })}
            </div>
            <form className="mr-settings-form" onSubmit={adjustDriverWallet}>
              <label>Driver
                <select required value={walletAdjustment.driverId} onChange={event => setWalletAdjustment(current => ({ ...current, driverId: event.target.value }))}>
                  <option value="">Choose driver</option>
                  {data.drivers.map(driver => <option key={driver.user_id} value={driver.user_id}>{driver.full_name} · @{driver.username}</option>)}
                </select>
              </label>
              <label>Balance type
                <select value={walletAdjustment.asset} onChange={event => setWalletAdjustment(current => ({ ...current, asset: event.target.value }))}>
                  <option value="real">Real balance</option>
                  <option value="bonus">Bonus balance</option>
                  <option value="coin">Coins</option>
                </select>
              </label>
              <label>Action
                <select value={walletAdjustment.direction} onChange={event => setWalletAdjustment(current => ({ ...current, direction: event.target.value }))}>
                  <option value="credit">Fund / add</option>
                  <option value="debit">Withdraw / deduct</option>
                </select>
              </label>
              <label>Amount ({walletAdjustment.asset === 'coin' ? 'coins' : 'ETB'})
                <input required type="number" min={walletAdjustment.asset === 'coin' ? '1' : '0.01'} step={walletAdjustment.asset === 'coin' ? '1' : '0.01'} value={walletAdjustment.amount} onChange={event => setWalletAdjustment(current => ({ ...current, amount: event.target.value }))} />
              </label>
              <label className="mr-wallet-reason">Reason
                <input required maxLength="500" value={walletAdjustment.description} onChange={event => setWalletAdjustment(current => ({ ...current, description: event.target.value }))} />
              </label>
              <button type="submit" className="mr-primary" disabled={busy || !walletAdjustment.driverId}>{busy ? 'Applying…' : `${walletAdjustment.direction === 'credit' ? 'Fund' : 'Deduct'} driver balance`}</button>
            </form>
          </>
        ) : <p className="mr-muted">No Mini Ride driver accounts are available to manage.</p>}
      </section>
      {pdfViewer && (
        <div className="mr-modal-backdrop" role="presentation" onClick={() => setPdfViewer(null)}>
          <div className="mr-pdf-modal" role="dialog" aria-modal="true" aria-label={`${pdfViewer.label} preview`} onClick={event => event.stopPropagation()}>
            <div className="mr-section-title mr-pdf-header"><div><h2>{pdfViewer.label}</h2></div><button type="button" className="mr-small-button" onClick={() => setPdfViewer(null)}>Close</button></div>
            <iframe title={pdfViewer.label} src={pdfViewer.source} className="mr-pdf-frame" />
          </div>
        </div>
      )}
    </div>
  )
}

export default RootMiniRideManagement
