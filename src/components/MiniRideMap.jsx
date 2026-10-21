import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getMiniRideRoadRoute } from '../utils/miniRideRouting'

const DEFAULT_CENTER = [9.03, 38.74]
const roadLayer = () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
})
const satelliteLayer = () => L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { maxZoom: 19, attribution: 'Tiles &copy; Esri' }
)

function MiniRideMap({ drivers = [], ride = null, rides = [], routePreview = null, overlay = null, height = 280 }) {
  const elementRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)
  const [roadRoutes, setRoadRoutes] = useState({})
  const rideItems = rides.length ? rides : (ride ? [ride] : [])
  const routeSignature = useMemo(() => rideItems.map(item => [
    item.ride_id,
    item.pickup_latitude,
    item.pickup_longitude,
    item.destination_latitude,
    item.destination_longitude,
  ].join(':')).join('|'), [rideItems])

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return undefined
    const map = L.map(elementRef.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 12)
    const roads = roadLayer().addTo(map)
    const satellite = satelliteLayer()
    L.control.layers({ 'Road navigation': roads, Satellite: satellite }, {}, { position: 'topright' }).addTo(map)
    mapRef.current = map
    layersRef.current = L.layerGroup().addTo(map)
    const resize = window.setTimeout(() => map.invalidateSize(), 0)
    return () => {
      window.clearTimeout(resize)
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [])

  useEffect(() => {
    let active = true
    const controllers = []
    const targets = rideItems.filter(item =>
      item.pickup_latitude != null && item.pickup_longitude != null &&
      item.destination_latitude != null && item.destination_longitude != null
    ).slice(0, 20)
    if (!targets.length) {
      setRoadRoutes({})
      return undefined
    }
    Promise.all(targets.map(async item => {
      const controller = new AbortController()
      controllers.push(controller)
      try {
        const route = await getMiniRideRoadRoute(
          { latitude: item.pickup_latitude, longitude: item.pickup_longitude },
          { latitude: item.destination_latitude, longitude: item.destination_longitude },
          controller.signal
        )
        return [item.ride_id, route.coordinates]
      } catch (error) {
        if (error.name !== 'AbortError') console.error('Could not load Mini Ride road route:', error)
        return null
      }
    })).then(results => {
      if (active) setRoadRoutes(Object.fromEntries(results.filter(Boolean)))
    })
    return () => {
      active = false
      controllers.forEach(controller => controller.abort())
    }
  }, [routeSignature])

  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers) return
    layers.clearLayers()
    const bounds = []
    const addPin = (latitude, longitude, label, color, symbol = '') => {
      const lat = Number(latitude)
      const lon = Number(longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
      const marker = L.marker([lat, lon], {
        icon: L.divIcon({
          className: 'mini-ride-map-marker',
          html: `<span style="--marker-color:${color}">${symbol || '•'}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      })
      const popupContent = document.createElement('span')
      popupContent.textContent = label
      marker.bindPopup(popupContent)
      marker.addTo(layers)
      bounds.push([lat, lon])
    }

    drivers.forEach(driver => addPin(
      driver.latitude,
      driver.longitude,
      `${driver.full_name || 'Driver'} · Online`,
      '#14804a',
      'D'
    ))
    const routeItems = rides.length ? rides : (ride ? [ride] : [])
    routeItems.forEach(item => {
      addPin(item.pickup_latitude, item.pickup_longitude, `Pickup · ${item.pickup_label || 'Ride origin'}`, '#c41e3a', 'A')
      addPin(item.destination_latitude, item.destination_longitude, `Destination · ${item.destination || 'Ride destination'}`, '#b7791f', 'B')
      addPin(item.driver_latitude, item.driver_longitude, `Driver · ${item.driver_full_name || 'Assigned'}`, '#14804a', 'D')
      addPin(item.passenger_latitude, item.passenger_longitude, `Passenger · Live location`, '#2563eb', 'P')
      const plannedRoute = roadRoutes[item.ride_id]
      if (plannedRoute?.length > 1) {
        L.polyline(plannedRoute, { color: '#2463eb', weight: 5, opacity: .72, dashArray: '9 7' }).addTo(layers)
        bounds.push(...plannedRoute)
      }
      const route = (item.points || [])
        .filter(point => point.role === 'driver')
        .map(point => [Number(point.latitude), Number(point.longitude)])
        .filter(point => point.every(Number.isFinite))
      if (route.length > 1) {
        L.polyline(route, { color: '#9d142d', weight: 5, opacity: .9 }).addTo(layers)
        bounds.push(...route)
      }
    })
    if (routePreview?.coordinates?.length > 1) {
      L.polyline(routePreview.coordinates, { color: '#2463eb', weight: 5, opacity: .8, dashArray: '9 7' }).addTo(layers)
      bounds.push(...routePreview.coordinates)
    }
    if (routePreview?.origin) {
      addPin(routePreview.origin.latitude, routePreview.origin.longitude, 'Pickup · Current location', '#c41e3a', 'A')
    }
    if (routePreview?.destination) {
      addPin(routePreview.destination.latitude, routePreview.destination.longitude, `Destination · ${routePreview.destination.label}`, '#b7791f', 'B')
    }

    if (bounds.length === 1) map.setView(bounds[0], 14)
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
  }, [drivers, ride, rides, roadRoutes, routePreview])

  return (
    <div className="mini-ride-map-container">
      <div
        ref={elementRef}
        className="mini-ride-map"
        style={{ height }}
        role="img"
        aria-label="Mini Ride map with live locations, road routes, and satellite map option"
      />
      {overlay && <div className="mr-map-fare-overlay" role="status">{overlay}</div>}
      <div className="mr-map-legend" aria-label="Map route legend">
        <span><i className="planned" /> Planned road route</span>
        <span><i className="tracked" /> Live driver GPS trace</span>
        <span><i className="pickup" /> Pickup</span>
        <span><i className="destination" /> Destination</span>
      </div>
    </div>
  )
}

export default MiniRideMap
