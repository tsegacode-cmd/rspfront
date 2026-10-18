import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER = [9.03, 38.74]

function MiniRideMap({ drivers = [], ride = null, height = 280 }) {
  const elementRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return undefined
    const map = L.map(elementRef.current, { scrollWheelZoom: false }).setView(DEFAULT_CENTER, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
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
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers) return
    layers.clearLayers()
    const bounds = []
    const addPin = (latitude, longitude, label, color) => {
      const lat = Number(latitude)
      const lon = Number(longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
      const marker = L.circleMarker([lat, lon], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).bindPopup(label)
      marker.addTo(layers)
      bounds.push([lat, lon])
    }

    drivers.forEach(driver => addPin(
      driver.latitude,
      driver.longitude,
      `${driver.full_name || 'Driver'} · Online`,
      '#14804a'
    ))
    if (ride) {
      addPin(ride.pickup_latitude, ride.pickup_longitude, `Pickup · ${ride.pickup_label || 'Ride origin'}`, '#c41e3a')
      addPin(ride.driver_latitude, ride.driver_longitude, `Driver · ${ride.driver_full_name || 'Assigned'}`, '#14804a')
      addPin(ride.passenger_latitude, ride.passenger_longitude, 'Passenger · Live location', '#2563eb')
      const route = (ride.points || [])
        .filter(point => point.role === 'driver')
        .map(point => [Number(point.latitude), Number(point.longitude)])
        .filter(point => point.every(Number.isFinite))
      if (route.length > 1) L.polyline(route, { color: '#9d142d', weight: 4, opacity: .8 }).addTo(layers)
    }

    if (bounds.length === 1) map.setView(bounds[0], 14)
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 })
  }, [drivers, ride])

  return (
    <div
      ref={elementRef}
      className="mini-ride-map"
      style={{ height }}
      role="img"
      aria-label="Mini Ride map showing only location-sharing drivers and trip locations"
    />
  )
}

export default MiniRideMap
