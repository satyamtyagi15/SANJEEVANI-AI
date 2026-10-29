import { useState, useEffect, useRef } from 'react';
import {
  Pill,
  Store,
  Check,
  Plus,
  Trash2,
  Send,
  Loader2,
  IndianRupee,
  Clock,
  MapPin,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Phone,
  Navigation,
} from 'lucide-react';
import {
  fetchNearbyMedicalFacilities,
  checkMedicineStock,
  sendPrescriptionToPharmacy,
} from '../services/PharmacyService';

const PharmacyPrescriptionWidget = ({ suggestedMeds, patientId, location, coords }) => {
  const [facilities, setFacilities] = useState([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [manualFacility, setManualFacility] = useState('');
  const [fetchState, setFetchState] = useState({ status: 'loading', error: null, resolved: null, radiusM: 0 });
  const [retryTick, setRetryTick] = useState(0);
  const [medicines, setMedicines] = useState([]);
  const [newMedicineName, setNewMedicineName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sentStatus, setSentStatus] = useState(null); // null, 'success'
  const hasLoadedInitialMeds = useRef(false);

  /* ------------------- fetch real nearby facilities ------------------- */

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadFacilities = async () => {
      setFetchState({ status: 'loading', error: null, resolved: null, radiusM: 0 });
      const result = await fetchNearbyMedicalFacilities({
        location,
        lat: coords?.lat,
        lon: coords?.lon,
        signal: controller.signal,
        force: retryTick > 0,
      });
      if (cancelled) return;

      if (result?.facilities?.length) {
        setFacilities(result.facilities);
        setSelectedFacilityId((prev) =>
          result.facilities.some((f) => f.id === prev) ? prev : result.facilities[0].id
        );
        setFetchState({
          status: 'ready',
          error: null,
          resolved: result.resolved,
          radiusM: result.radiusM,
          cached: result.cached,
        });
      } else {
        setFacilities([]);
        setSelectedFacilityId('');
        setFetchState({
          status: 'empty',
          error: result?.error || 'no-results',
          resolved: result?.resolved || null,
          radiusM: result?.radiusM || 0,
        });
      }
    };

    loadFacilities();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [location, coords?.lat, coords?.lon, retryTick]);

  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId) || null;
  const facilityLabel = selectedFacility
    ? `${selectedFacility.name} (${selectedFacility.type})`
    : manualFacility.trim();

  const counts = facilities.reduce(
    (acc, f) => {
      const type = f.type.toLowerCase();
      if (type === 'pharmacy') acc.pharmacies += 1;
      else if (type === 'hospital') acc.hospitals += 1;
      else if (type === 'clinic') acc.clinics += 1;
      else acc.others += 1;
      return acc;
    },
    { pharmacies: 0, hospitals: 0, clinics: 0, others: 0 }
  );

  /* --------------------- stock + add/remove handlers ------------------ */

  // Initialize and fetch stock for meds when the selected facility changes
  useEffect(() => {
    if (!facilityLabel) return;

    const fetchStocks = async () => {
      // First load: use the AI-suggested meds. Later: keep the medicines already on screen
      // (including any that were added manually).
      const medsToFetch = !hasLoadedInitialMeds.current && suggestedMeds ? suggestedMeds : medicines.map((m) => m.name);
      hasLoadedInitialMeds.current = true;

      if (medsToFetch.length === 0) return;

      const loadingMeds = medsToFetch.map((name) => ({ name, loading: true }));
      setMedicines(loadingMeds);

      const resolvedMeds = await Promise.all(
        loadingMeds.map(async (m) => {
          const stockData = await checkMedicineStock(facilityLabel, m.name);
          return { name: m.name, loading: false, data: stockData };
        })
      );
      setMedicines(resolvedMeds);
      setSentStatus(null);
    };

    fetchStocks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityLabel, suggestedMeds]);

  const handleAddMedicine = async () => {
    if (!newMedicineName.trim() || !facilityLabel) return;
    const medName = newMedicineName.trim();
    setNewMedicineName("");

    // Add to list with loading state
    setMedicines(prev => [...prev, { name: medName, loading: true }]);

    // Fetch live stock
    const stockData = await checkMedicineStock(facilityLabel, medName);

    // Update list with resolved data
    setMedicines(prev => prev.map(m =>
      m.name === medName ? { name: medName, loading: false, data: stockData } : m
    ));
    setSentStatus(null);
  };

  const handleRemoveMedicine = (medName) => {
    setMedicines(prev => prev.filter(m => m.name !== medName));
    setSentStatus(null);
  };

  const handleSendToPharmacy = async () => {
    if (medicines.length === 0 || !facilityLabel) return;
    setIsSending(true);

    // Filter only medicines that are in stock
    const medsToSend = medicines.filter(m => !m.loading && m.data?.inStock).map(m => m.name);

    try {
      const result = await sendPrescriptionToPharmacy(facilityLabel, patientId, medsToSend);
      if (result.success) {
        setSentStatus(result.message);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const radiusKm = fetchState.radiusM ? Math.round((fetchState.radiusM / 1000) * 10) / 10 : null;

  return (
    <div style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem', borderRadius: '12px', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h4 style={{ margin: 0, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Store size={18} /> Nearby Medical Facilities &amp; e-Prescription
        </h4>

        <select
          value={selectedFacilityId}
          onChange={(e) => { setSelectedFacilityId(e.target.value); setSentStatus(null); }}
          style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', background: 'var(--bg-elevated)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', fontSize: '0.85rem', maxWidth: '100%' }}
          disabled={isSending || sentStatus || fetchState.status === 'loading' || facilities.length === 0}
          aria-label="Select a nearby medical facility"
        >
          {fetchState.status === 'loading' ? (
            <option>Searching nearby facilities…</option>
          ) : facilities.length === 0 ? (
            <option>No facilities loaded</option>
          ) : (
            facilities.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} — {f.type} · {f.distKm} km
              </option>
            ))
          )}
        </select>
      </div>

      {/* Location + live source line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.7rem', flexWrap: 'wrap' }}>
        <MapPin size={13} />
        {fetchState.resolved ? (
          <span>
            {fetchState.resolved.label}
            {radiusKm ? ` · within ${radiusKm} km` : ''}
            {fetchState.status === 'ready' ? ' · live OpenStreetMap data' : ''}
          </span>
        ) : (
          <span>{location ? `Location: ${location}` : 'No location captured for this report'}</span>
        )}

        {fetchState.status === 'ready' && (
          <span style={{ display: 'inline-flex', gap: '0.6rem', marginLeft: '0.35rem' }}>
            {counts.pharmacies > 0 && <span style={{ color: '#34d399' }}>{counts.pharmacies} {counts.pharmacies === 1 ? 'pharmacy' : 'pharmacies'}</span>}
            {counts.hospitals > 0 && <span style={{ color: '#f87171' }}>{counts.hospitals} hospital{counts.hospitals > 1 ? 's' : ''}</span>}
            {counts.clinics > 0 && <span style={{ color: '#60a5fa' }}>{counts.clinics} clinic{counts.clinics > 1 ? 's' : ''}</span>}
            {counts.others > 0 && <span>{counts.others} other</span>}
          </span>
        )}
      </div>

      {/* Selected facility details */}
      {selectedFacility && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.6rem 0.8rem', marginBottom: '0.8rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <strong style={{ color: '#e5e7eb' }}>{selectedFacility.name}</strong>
            <span style={{ color: '#60a5fa' }}>{selectedFacility.type}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', color: '#9ca3af' }}>
              <Navigation size={12} /> {selectedFacility.distKm} km
            </span>
            {selectedFacility.emergency && (
              <span style={{ color: '#f87171', fontWeight: 'bold' }}>Emergency</span>
            )}
          </div>
          {selectedFacility.address && <div style={{ color: '#9ca3af' }}>{selectedFacility.address}</div>}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.25rem', color: '#9ca3af' }}>
            {selectedFacility.phone && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Phone size={12} /> {selectedFacility.phone}
              </span>
            )}
            {selectedFacility.openingHours && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <Clock size={12} /> {selectedFacility.openingHours}
              </span>
            )}
            <a href={selectedFacility.osmUrl} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}>
              <ExternalLink size={12} /> View on map
            </a>
          </div>
        </div>
      )}

      {/* Empty / error states with manual fallback */}
      {fetchState.status === 'empty' && (
        <div style={{ marginBottom: '0.8rem', fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: fetchState.error === 'no-location' || fetchState.error === 'no-results' ? '#fbbf24' : '#f87171', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <AlertTriangle size={14} />
            {fetchState.error === 'no-location'
              ? 'This report has no usable location. Enter a facility name below, or start a new triage with location enabled.'
              : fetchState.error === 'no-results'
                ? `No pharmacies, hospitals or clinics found in OpenStreetMap near ${fetchState.resolved?.label || 'this location'}.`
                : 'Could not reach the map data service (OpenStreetMap). Retry or enter a facility name manually.'}
            <button
              type="button"
              onClick={() => setRetryTick((n) => n + 1)}
              style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: '#cbd5e1', borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
            >
              <RefreshCw size={12} /> Retry
            </button>
          </div>

          <input
            type="text"
            value={manualFacility}
            onChange={(e) => { setManualFacility(e.target.value); setSentStatus(null); }}
            placeholder="Facility name (manual): e.g., City Hospital Pharmacy"
            style={{ width: '100%', padding: '0.55rem 0.8rem', borderRadius: '6px', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', fontSize: '0.85rem' }}
          />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {medicines.map((med, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <Pill size={16} style={{ color: '#a1a1aa' }} />
              <strong style={{ color: '#e5e7eb', fontSize: '0.9rem' }}>{med.name}</strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              {med.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#9ca3af', fontSize: '0.8rem' }}>
                  <Loader2 size={14} className="animate-spin" /> Fetching Stock...
                </div>
              ) : med.data ? (
                <>
                  {med.data.inStock ? (
                    <span style={{ color: '#10b981', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold' }}>
                      <Check size={14} /> In Stock ({med.data.quantity})
                    </span>
                  ) : (
                    <span style={{ color: '#ef4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold' }}>
                      Out of Stock
                    </span>
                  )}

                  <span style={{ color: '#fbbf24', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <IndianRupee size={12} /> {med.data.price}
                  </span>

                  <span style={{ color: '#9ca3af', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Clock size={12} /> Exp: {med.data.expiryDate}
                  </span>
                </>
              ) : null}

              {!sentStatus && (
                <button
                  onClick={() => handleRemoveMedicine(med.name)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.7, padding: '0.2rem' }}
                  title="Remove"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!sentStatus && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <input
            type="text"
            placeholder="Manual Med: e.g., Dolo 650mg"
            value={newMedicineName}
            onChange={(e) => setNewMedicineName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddMedicine()}
            disabled={!facilityLabel}
            style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '6px', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', opacity: facilityLabel ? 1 : 0.5 }}
          />
          <button
            onClick={handleAddMedicine}
            disabled={!newMedicineName.trim() || !facilityLabel}
            style={{ padding: '0 1rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', cursor: newMedicineName.trim() && facilityLabel ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: facilityLabel ? 1 : 0.5 }}
          >
            <Plus size={16} /> Add
          </button>
        </div>
      )}

      {medicines.length > 0 && !sentStatus && (
        <button
          onClick={handleSendToPharmacy}
          disabled={isSending || !facilityLabel || medicines.filter(m => m.data?.inStock).length === 0}
          style={{
            width: '100%', marginTop: '1.5rem', padding: '0.8rem',
            background: 'linear-gradient(90deg, #3b82f6, #2563eb)', color: '#fff',
            border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem',
            cursor: isSending ? 'not-allowed' : 'pointer',
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
            opacity: !facilityLabel || medicines.filter(m => m.data?.inStock).length === 0 ? 0.5 : 1
          }}
        >
          {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          {isSending ? 'Sending to Network...' : 'Approve & Send to Pharmacy'}
        </button>
      )}

      {sentStatus && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '8px', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
          <Check size={20} /> {sentStatus}
        </div>
      )}
    </div>
  );
};

export default PharmacyPrescriptionWidget;
