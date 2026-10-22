const validCoordinates = point => (
  point &&
  Number.isFinite(Number(point.latitude)) &&
  Number(point.latitude) >= -90 &&
  Number(point.latitude) <= 90 &&
  Number.isFinite(Number(point.longitude)) &&
  Number(point.longitude) >= -180 &&
  Number(point.longitude) <= 180
)

export const estimateMiniRideFare = (distanceKm, settings, loadKg = 0) => {
  if (!settings || !Number.isFinite(Number(distanceKm)) || Number(distanceKm) < 0) return null
  return Math.round((
    Number(settings.base_fare || 0) +
    Number(distanceKm) * Number(settings.fare_per_km || 0) +
    Number(loadKg || 0) / 1000 * Number(settings.fare_per_ton || 0)
  ) * 100) / 100
}

export const getMiniRideCurrentDistance = ride => {
  if (!ride) return 0
  if (['requested', 'accepted'].includes(ride.status)) {
    return Number(ride.route_distance_km || ride.distance_km || 0)
  }
  return Number(ride.distance_km || ride.route_distance_km || 0)
}

export const geocodeMiniRideDestination = async (query, signal) => {
  const search = String(query || '').trim()
  if (search.length < 3) throw new Error('Enter at least 3 characters for the destination.')
  const params = new URLSearchParams({
    q: search,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'et',
  })
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`Destination search failed (HTTP ${response.status}).`)
  const results = await response.json()
  const result = results[0]
  if (!result || !Number.isFinite(Number(result.lat)) || !Number.isFinite(Number(result.lon))) {
    throw new Error('No destination was found in Ethiopia. Try a nearby landmark or a more complete address.')
  }
  return {
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    label: result.display_name,
  }
}

export const getMiniRideRoadRoute = async (from, to, signal) => {
  if (!validCoordinates(from) || !validCoordinates(to)) {
    throw new Error('A valid pickup and destination are required to calculate the road route.')
  }
  const coordinates = `${Number(from.longitude)},${Number(from.latitude)};${Number(to.longitude)},${Number(to.latitude)}`
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`Road route lookup failed (HTTP ${response.status}).`)
  const result = await response.json()
  const route = result.routes?.[0]
  if (!route || !Array.isArray(route.geometry?.coordinates) || route.geometry.coordinates.length < 2) {
    throw new Error('A drivable route could not be found for this destination.')
  }
  return {
    distanceKm: Number(route.distance) / 1000,
    durationMinutes: Number(route.duration) / 60,
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude]),
  }
}

export const getMiniRideNavigationUrl = (from, to) => {
  if (!validCoordinates(from) || !validCoordinates(to)) return ''
  const params = new URLSearchParams({
    api: '1',
    origin: `${Number(from.latitude)},${Number(from.longitude)}`,
    destination: `${Number(to.latitude)},${Number(to.longitude)}`,
    travelmode: 'driving',
  })
  return `https://www.google.com/maps/dir/?${params}`
}
