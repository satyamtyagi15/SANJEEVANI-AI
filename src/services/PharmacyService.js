// Real OpenStreetMap data for nearby medical facilities (pharmacies, hospitals, clinics,
// doctors, dentists, nursing homes). Both APIs are free and keyless:
//   - Nominatim  -> turns the location text fetched in the kiosk into coordinates
//   - Overpass   -> returns real facilities around those coordinates
// Nothing here is simulated: if the APIs return no facilities, the UI says so instead of
// inventing a pharmacy name.

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const GEO_TIMEOUT_MS = 10000;
const OVERPASS_TIMEOUT_MS = 9000;
const DEFAULT_RADIUS_M = 6000;
const WIDE_RADIUS_M = 15000;
const MAX_FACILITIES = 25;
const CACHE_TTL_MS = 10 * 60 * 1000;

const memoryCache = new Map();
const inFlight = new Map();

const FACILITY_LABELS = {
  pharmacy: 'Pharmacy',
  hospital: 'Hospital',
  clinic: 'Clinic',
  doctors: 'Doctor',
  dentist: 'Dentist',
  nursing_home: 'Nursing home',
  laboratory: 'Laboratory',
  centre: 'Health centre',
  health_centre: 'Health centre',
  rehabilitation: 'Rehabilitation centre',
  blood_donation: 'Blood bank',
  vaccination_centre: 'Vaccination centre',
  sample_collection: 'Sample collection centre',
};

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

/* ----------------------------- small utils ----------------------------- */

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

function shortPlaceLabel(hit, fallback) {
  const display = hit?.display_name || '';
  if (!display) return fallback || 'Selected location';
  const parts = display.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return parts.join(', ');
  return `${parts[0]}, ${parts[parts.length - 3] || parts[1]}`;
}

/* ----------------------------- geocoding ------------------------------ */

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

/* ------------------------------ overpass ------------------------------- */

function buildOverpassQuery(lat, lon, radiusM) {
  return `[out:json][timeout:25];
(
  nwr["amenity"="pharmacy"](around:${radiusM},${lat},${lon});
  nwr["amenity"="hospital"](around:${radiusM},${lat},${lon});
  nwr["amenity"="clinic"](around:${radiusM},${lat},${lon});
  nwr["amenity"="doctors"](around:${radiusM},${lat},${lon});
  nwr["amenity"="dentist"](around:${radiusM},${lat},${lon});
  nwr["amenity"="nursing_home"](around:${radiusM},${lat},${lon});
  nwr["healthcare"](around:${radiusM},${lat},${lon});
);
out center 120;`;
}

async function fetchOverpass(lat, lon, radiusM, signal) {
  const body = 'data=' + encodeURIComponent(buildOverpassQuery(lat, lon, radiusM));
  const shared = new AbortController();
  const forwardAbort = () => shared.abort();
  signal?.addEventListener?.('abort', forwardAbort, { once: true });

  try {
    return await Promise.any(
      OVERPASS_ENDPOINTS.map((endpoint) =>
        fetchJson(endpoint, {
          timeoutMs: OVERPASS_TIMEOUT_MS,
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          },
          signal: shared.signal,
        })
      )
    );
  } finally {
    // Stop the slower mirror as soon as one answered (or the whole thing aborted).
    shared.abort();
    signal?.removeEventListener?.('abort', forwardAbort);
  }
}

function facilityType(tags) {
  const raw = tags.amenity || tags.healthcare || 'healthcare';
  if (FACILITY_LABELS[raw]) return FACILITY_LABELS[raw];
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, ' ');
}

function buildAddress(tags) {
  const parts = [
    tags['addr:housename'],
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'] || tags['addr:neighbourhood'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:postcode'],
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function normalizeFacilities(elements, origin) {
  const facilities = [];
  const seen = new Set();

  (elements || []).forEach((element) => {
    const tags = element.tags || {};
    const name = (tags.name || tags['name:en'] || tags.brand || tags.operator || '').trim();
    if (!name) return;

    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const distKm = calculateDistance(origin.lat, origin.lon, lat, lon);
    if (distKm > 25) return; // guard against bad geocodes / bad OSM data

    // Same facility is often mapped as node + way + relation: de-duplicate within ~500 m.
    const dedupeKey = `${name.toLowerCase()}|${Math.round(distKm * 2)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    facilities.push({
      id: `${element.type}/${element.id}`,
      name,
      type: facilityType(tags),
      distKm: Math.round(distKm * 10) / 10,
      lat,
      lon,
      address: buildAddress(tags),
      phone: tags.phone || tags['contact:phone'] || null,
      openingHours: tags.opening_hours || null,
      emergency: tags.emergency === 'yes',
      osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    });
  });

  facilities.sort((a, b) => a.distKm - b.distKm);
  return facilities.slice(0, MAX_FACILITIES);
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

  const cacheKey = `fac:${resolved.lat.toFixed(3)},${resolved.lon.toFixed(3)}:${radius || 'auto'}`;
  if (!force) {
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return { ...cached, cached: true };
  }

  const existing = inFlight.get(cacheKey);
  if (existing && !force) return existing;

  const task = (async () => {
    let radiusM = Number(radius) > 0 ? Number(radius) : DEFAULT_RADIUS_M;
    try {
      let payload = await fetchOverpass(resolved.lat, resolved.lon, radiusM, signal);
      let facilities = normalizeFacilities(payload?.elements, resolved);

      // Sparse/rural area: one wider retry before giving up.
      if (facilities.length === 0 && radiusM < WIDE_RADIUS_M) {
        radiusM = WIDE_RADIUS_M;
        payload = await fetchOverpass(resolved.lat, resolved.lon, radiusM, signal);
        facilities = normalizeFacilities(payload?.elements, resolved);
      }

      const result = {
        facilities,
        resolved,
        source: 'OpenStreetMap',
        radiusM,
        error: facilities.length ? null : 'no-results',
      };
      cacheSet(cacheKey, result);
      return result;
    } catch (err) {
      const result = {
        facilities: [],
        resolved,
        source: 'OpenStreetMap',
        radiusM,
        error: err?.name === 'AbortError' ? 'aborted' : 'osm-unavailable',
      };
      cacheSet(cacheKey, result);
      return result;
    } finally {
      inFlight.delete(cacheKey);
    }
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
