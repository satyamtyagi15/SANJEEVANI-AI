// Real OpenStreetMap data for nearby medical facilities (pharmacies, hospitals, clinics,
// doctors, dentists). Free, keyless, CORS-enabled APIs:
//
//   1. Photon (komoot)  -> fast category search inside a bounding box (primary)
//   2. Nominatim        -> bounded viewbox search (fallback)
//
// Both are OSM-based and return real facilities. There is no fabricated fallback: if
// neither service returns anything, the UI is told exactly that.
//
// (Overpass was removed as the primary source: its public instances took 45-60 s per
// query from real networks, which is why the widget previously ended up showing the
// hard-coded "Network Fallback" text.)

const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

const PHOTON_TIMEOUT_MS = 5000;
const NOMINATIM_TIMEOUT_MS = 6000;
const NOMINATIM_MIN_INTERVAL_MS = 1100; // Nominatim policy: at most 1 request/second
const GEO_TIMEOUT_MS = 10000;

// Search area: nearest-first, widening up to 5000 km. A single huge query makes the
// providers return far-away matches first, so we start local (25 km) and widen only
// when there are too few facilities around — a rural report can still reach 5000 km.
// Results are always sorted nearest-first.
const SEARCH_RADII_M = [25000, 100000, 500000, 5000000];
const MIN_RESULTS_BEFORE_WIDEN = 3;
const MAX_FACILITIES = 30;
const CACHE_TTL_MS = 10 * 60 * 1000;

const PHOTON_TERMS = [
  { q: 'pharmacy', tag: 'amenity:pharmacy', type: 'Pharmacy' },
  { q: 'hospital', tag: 'amenity:hospital', type: 'Hospital' },
  { q: 'clinic', tag: 'amenity:clinic', type: 'Clinic' },
  { q: 'doctors', tag: 'amenity:doctors', type: 'Doctor' },
  { q: 'dentist', tag: 'amenity:dentist', type: 'Dentist' },
];

const NOMINATIM_TERMS = ['pharmacy', 'hospital', 'clinic'];

const memoryCache = new Map();
const inFlight = new Map();
let lastNominatimAt = 0;

/* ----------------------------- small utils ----------------------------- */

const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

function cacheGet(key) {
  const hit = memoryCache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value) {
  memoryCache.set(key, { at: Date.now(), value });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch + JSON parse where the timeout also covers the body download. */
async function fetchJson(url, { timeoutMs, init = {}, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener?.('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text(); // body read happens before the timer is cleared
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', forwardAbort);
  }
}

function boundingBox(lat, lon, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    south: Math.max(-85, lat - dLat),
    north: Math.min(85, lat + dLat),
    west: Math.max(-180, lon - dLon),
    east: Math.min(180, lon + dLon),
  };
}

function filterAndRank(facilities, origin, radiusM) {
  const maxKm = radiusM / 1000 + 0.25;
  const seen = new Set();
  const out = [];

  facilities.forEach((facility) => {
    if (!facility || !Number.isFinite(facility.lat) || !Number.isFinite(facility.lon)) return;
    const distKm = calculateDistance(origin.lat, origin.lon, facility.lat, facility.lon);
    if (distKm > maxKm) return;

    // Same facility is often mapped as node + way: de-duplicate within ~500 m.
    const dedupeKey = `${facility.name.toLowerCase()}|${Math.round(distKm * 2)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    out.push({ ...facility, distKm: Math.round(distKm * 10) / 10 });
  });

  out.sort((a, b) => a.distKm - b.distKm);
  return out.slice(0, MAX_FACILITIES);
}

/* ----------------------------- geocoding ------------------------------ */

function shortPlaceLabel(hit, fallback) {
  const display = hit?.display_name || '';
  if (!display) return fallback || 'Selected location';
  const parts = display.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(', ');
  return `${parts[0]}, ${parts[parts.length - 3] || parts[1]}`;
}

export async function geocodeLocation(location, signal, force = false) {
  const query = (location || '').trim();
  if (!query) return null;

  const key = `geo:${query.toLowerCase()}`;
  if (!force) {
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
  }

  const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  try {
    lastNominatimAt = Date.now();
    const data = await fetchJson(url, {
      timeoutMs: GEO_TIMEOUT_MS,
      init: { headers: { Accept: 'application/json' } },
      signal,
    });
    const hit = Array.isArray(data) ? data[0] : null;
    const result = hit
      ? {
          lat: Number(hit.lat),
          lon: Number(hit.lon),
          label: shortPlaceLabel(hit, query),
          source: 'geocoded',
        }
      : null;
    if (result && Number.isFinite(result.lat) && Number.isFinite(result.lon)) {
      cacheSet(key, result);
      return result;
    }
    cacheSet(key, null);
    return null;
  } catch (err) {
    if (err?.name === 'AbortError') return null;
    cacheSet(key, null);
    return null;
  }
}

async function resolveLocation({ location, lat, lon, signal, force }) {
  const nLat = Number(lat);
  const nLon = Number(lon);
  if (Number.isFinite(nLat) && Number.isFinite(nLon) && Math.abs(nLat) <= 90 && Math.abs(nLon) <= 180) {
    return {
      lat: nLat,
      lon: nLon,
      label: (location || '').trim() || `${nLat.toFixed(4)}, ${nLon.toFixed(4)}`,
      source: 'gps',
    };
  }
  return geocodeLocation(location, signal, force);
}

/* ------------------------------- photon -------------------------------- */

function osmUrlFromPhoton(props) {
  const type = String(props.osm_type || 'N').toUpperCase();
  const kind = type === 'W' ? 'way' : type === 'R' ? 'relation' : 'node';
  return `https://www.openstreetmap.org/${kind}/${props.osm_id}`;
}

function facilityFromPhoton(feature, fallbackType) {
  const props = feature?.properties || {};
  const name = String(props.name || props['name:en'] || '').trim();
  const coords = feature?.geometry?.coordinates;
  if (!name || !Array.isArray(coords) || coords.length < 2) return null;

  const street = [props.housenumber, props.street].filter(Boolean).join(' ');
  const address = [street, props.district || props.city, props.state, props.postcode]
    .filter(Boolean)
    .join(', ') || null;

  const typeFromTag = props.osm_value === 'doctors' ? 'Doctor' : props.osm_value === 'dentist' ? 'Dentist' : null;

  return {
    id: `${props.osm_type || 'N'}${props.osm_id}`,
    name,
    type: typeFromTag || fallbackType,
    lat: Number(coords[1]),
    lon: Number(coords[0]),
    address,
    phone: props.phone || props['contact:phone'] || null,
    openingHours: props.opening_hours || null,
    emergency: false,
    osmUrl: osmUrlFromPhoton(props),
  };
}

async function fetchPhotonRound(resolved, radiusM, signal) {
  const box = boundingBox(resolved.lat, resolved.lon, radiusM);
  const bbox = [box.west, box.south, box.east, box.north].map((v) => v.toFixed(5)).join(',');
  let succeeded = 0;
  const facilities = [];

  await Promise.all(
    PHOTON_TERMS.map(async (term) => {
      const url =
        `${PHOTON_URL}?q=${encodeURIComponent(term.q)}` +
        `&osm_tag=${encodeURIComponent(term.tag)}` +
        `&bbox=${bbox}&lat=${resolved.lat}&lon=${resolved.lon}&limit=40&lang=en`;
      try {
        const data = await fetchJson(url, {
          timeoutMs: PHOTON_TIMEOUT_MS,
          init: { headers: { Accept: 'application/json' } },
          signal,
        });
        succeeded += 1;
        (data?.features || []).forEach((feature) => {
          const facility = facilityFromPhoton(feature, term.type);
          if (facility) facilities.push(facility);
        });
      } catch {
        // One category failing must not fail the round.
      }
    })
  );

  return { facilities, succeeded };
}

/* ------------------------------ nominatim ------------------------------ */

function facilityFromNominatim(item, fallbackType) {
  // Text search can also match roads/areas whose *name* contains "pharmacy"/"hospital".
  // Only accept results whose OSM type is an actual healthcare facility.
  const typeMap = {
    pharmacy: 'Pharmacy',
    hospital: 'Hospital',
    clinic: 'Clinic',
    doctors: 'Doctor',
    dentist: 'Dentist',
  };
  const mappedType = typeMap[item?.type];
  if (!mappedType) return null;

  const name = String(item?.name || item?.display_name?.split(',')[0] || '').trim();
  const lat = Number(item?.lat);
  const lon = Number(item?.lon);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const address = item.display_name
    ? item.display_name.replace(`${name}, `, '').split(',').slice(0, 4).join(', ')
    : null;

  return {
    id: `${item.osm_type || 'N'}${item.osm_id}`,
    name,
    type: mappedType || fallbackType,
    lat,
    lon,
    address,
    phone: item.extratags?.phone || item.extratags?.['contact:phone'] || null,
    openingHours: item.extratags?.opening_hours || null,
    emergency: false,
    osmUrl: item.osm_type
      ? `https://www.openstreetmap.org/${String(item.osm_type).toLowerCase()}/${item.osm_id}`
      : null,
  };
}

async function fetchNominatimRound(resolved, radiusM, signal) {
  const box = boundingBox(resolved.lat, resolved.lon, radiusM);
  const viewbox = [box.west, box.north, box.east, box.south].map((v) => v.toFixed(5)).join(',');
  const facilities = [];
  let succeeded = 0;

  for (const term of NOMINATIM_TERMS) {
    const wait = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastNominatimAt));
    if (wait > 0) await sleep(wait);
    lastNominatimAt = Date.now();

    const url =
      `${NOMINATIM_BASE}/search?format=jsonv2&limit=40&bounded=1&extratags=1` +
      `&viewbox=${viewbox}&q=${encodeURIComponent(term)}`;
    try {
      const data = await fetchJson(url, {
        timeoutMs: NOMINATIM_TIMEOUT_MS,
        init: { headers: { Accept: 'application/json' } },
        signal,
      });
      succeeded += 1;
      (Array.isArray(data) ? data : []).forEach((item) => {
        const facility = facilityFromNominatim(item, 'Healthcare facility');
        if (facility) facilities.push(facility);
      });
    } catch {
      // try the next term
    }
  }

  return { facilities, succeeded };
}

/* ------------------------------ main API ------------------------------- */

/**
 * Resolve the triage location (GPS coords, else geocode the location text) and return
 * real nearby medical facilities from OpenStreetMap.
 *
 * @returns {{ facilities: Array, resolved: {lat:number, lon:number, label:string}|null,
 *             source: 'OpenStreetMap', radiusM: number,
 *             error: null|'no-location'|'osm-unavailable'|'no-results', cached?: boolean }}
 */
export async function fetchNearbyMedicalFacilities({ location, lat, lon, radius, signal, force = false } = {}) {
  const resolved = await resolveLocation({ location, lat, lon, signal, force });
  if (!resolved) {
    return {
      facilities: [],
      resolved: null,
      source: 'OpenStreetMap',
      radiusM: 0,
      error: 'no-location',
    };
  }

  const cacheKey = `fac:${resolved.lat.toFixed(3)},${resolved.lon.toFixed(3)}:${radius || 'auto'}:v4`;
  if (!force) {
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return { ...cached, cached: true };
  }

  const existing = inFlight.get(cacheKey);
  if (existing && !force) return existing;

  const task = (async () => {
    const radii = Number(radius) > 0 ? [Number(radius)] : SEARCH_RADII_M;
    let facilities = [];
    let usedRadius = radii[0];
    let providerReachable = false;

    // Query BOTH providers in parallel for the same area and merge whatever comes back:
    //  - Photon is fastest but its free tier is rate-limited from time to time
    //  - Nominatim bounded search is slower (1 req/s policy) but very reliable
    // Running them together keeps the worst case at ~one provider's latency instead of
    // adding the two latencies, and one provider being down never blocks the list.
    for (const radiusM of radii) {
      const [photonResult, nominatimResult] = await Promise.allSettled([
        fetchPhotonRound(resolved, radiusM, signal),
        fetchNominatimRound(resolved, radiusM, signal),
      ]);

      const photon = photonResult.status === 'fulfilled' ? photonResult.value : { facilities: [], succeeded: 0 };
      const nominatim = nominatimResult.status === 'fulfilled' ? nominatimResult.value : { facilities: [], succeeded: 0 };

      if (photon.succeeded > 0 || nominatim.succeeded > 0) providerReachable = true;
      facilities = filterAndRank([...photon.facilities, ...nominatim.facilities], resolved, radiusM);
      usedRadius = radiusM;
      if (facilities.length >= MIN_RESULTS_BEFORE_WIDEN) break;
    }

    const result = {
      facilities,
      resolved,
      source: 'OpenStreetMap',
      radiusM: usedRadius,
      error: facilities.length ? null : providerReachable ? 'no-results' : 'osm-unavailable',
    };

    cacheSet(cacheKey, result);
    inFlight.delete(cacheKey);
    return result;
  })();

  inFlight.set(cacheKey, task);
  return task;
}

/**
 * Backwards-compatible wrapper kept for any existing callers.
 * Returns human-readable labels only (no fabricated fallback names).
 */
export const fetchLivePharmacies = async (lat, lon, fallbackArea = '') => {
  const result = await fetchNearbyMedicalFacilities({ lat, lon, location: fallbackArea });
  return result.facilities.map((facility) => `${facility.name} — ${facility.type} (${facility.distKm} km)`);
};

/* ----------------------- prescription-side helpers --------------------- */
// NOTE: unchanged behaviour — these are the existing e-prescription flows and are not
// part of the nearby-facility feature.

// Helper to generate a consistent hash for a string so random values seem stable per session
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

export const checkMedicineStock = async (pharmacyName, medicineName) => {
  // Simulate network delay for realism
  await new Promise(resolve => setTimeout(resolve, 800));

  const key = pharmacyName + medicineName.toLowerCase();
  const hash = hashString(key);

  // 10% chance out of stock, otherwise 10 to 200 strips
  const inStock = (hash % 10) !== 0; 
  const quantity = inStock ? (hash % 190) + 10 : 0;
  
  // Price between 20 to 500 INR
  const price = (hash % 480) + 20;

  // Expiry date (1 to 24 months from now)
  const monthsToExpiry = (hash % 24) + 1;
  const expiryDate = new Date();
  expiryDate.setMonth(expiryDate.getMonth() + monthsToExpiry);

  return {
    medicineName,
    pharmacy: pharmacyName,
    inStock,
    quantity,
    price: price,
    expiryDate: expiryDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  };
};

export const sendPrescriptionToPharmacy = async (pharmacyName, patientId, medicines) => {
  // Simulate API call to send order
  await new Promise(resolve => setTimeout(resolve, 1500));
  const itemCount = Array.isArray(medicines) ? medicines.length : 0;
  return {
    success: true,
    orderId: `ORD-${Math.floor(10000 + Math.random() * 90000)}`,
    patientId,
    itemCount,
    message: `Prescription successfully sent to ${pharmacyName}`
  };
};
