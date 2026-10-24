import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Pill, 
  AlertTriangle, 
  CheckCircle, 
  Loader2, 
  Plus, 
  Trash2, 
  Download, 
  Save, 
  Sparkles, 
  FileText, 
  Activity, 
  Copy, 
  Check, 
  Info,
  Clock,
  ArrowRight
} from 'lucide-react';
import { analyzePharmacovigilanceADR } from '../services/AIEngine';
import { saveReportToDB, downloadPDF } from '../services/ReportService';
import { showAlert } from '../services/AlertService';

const Pharmacovigilance = () => {
  // Patient Details
  const [patientId, setPatientId] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('Male');
  const [comorbidities, setComorbidities] = useState('');
  const [allergies, setAllergies] = useState('');

  // Medications
  const [medications, setMedications] = useState([]);
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('');
  const [medDuration, setMedDuration] = useState('');

  // Adverse Symptoms
  const [symptoms, setSymptoms] = useState([]);
  const [currentSymptom, setCurrentSymptom] = useState('');
  const [symptomOnset, setSymptomOnset] = useState('');
  const [symptomSeverity, setSymptomSeverity] = useState('Severe');

  // Clinical Notes & State
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedMedWatch, setCopiedMedWatch] = useState(false);

  // Quick Preset Chips
  const commonSymptoms = [
    'Facial / Lip Angioedema',
    'Diffuse Maculopapular Rash',
    'Severe Muscle Aches & Tea-Colored Urine',
    'Jaundice & Upper Abdominal Pain',
    'Acute Dyspnea & Wheezing',
    'Persistent Intractable Dry Cough',
    'Bradycardia & Hypotension'
  ];

  const handleAddMedication = (e) => {
    if (e) e.preventDefault();
    if (!medName.trim()) return;
    const newMed = {
      name: medName.trim(),
      dose: medDose.trim() || 'Standard Dose',
      duration: medDuration.trim() || 'Recently started'
    };
    setMedications([...medications, newMed]);
    setMedName('');
    setMedDose('');
    setMedDuration('');
  };

  const handleRemoveMedication = (index) => {
    setMedications(medications.filter((_, i) => i !== index));
  };

  const handleAddSymptom = (symptomText, onsetText, severityLevel) => {
    const textToAdd = symptomText || currentSymptom;
    if (!textToAdd.trim()) return;
    const newSymptom = {
      symptom: textToAdd.trim(),
      onsetTime: onsetText || symptomOnset.trim() || 'Within last 24-48 hrs',
      severity: severityLevel || symptomSeverity
    };
    setSymptoms([...symptoms, newSymptom]);
    if (!symptomText) {
      setCurrentSymptom('');
      setSymptomOnset('');
    }
  };

  const handleRemoveSymptom = (index) => {
    setSymptoms(symptoms.filter((_, i) => i !== index));
  };

  const loadSampleCase = () => {
    setPatientId('PAT-PV-7731');
    setPatientAge('58');
    setPatientGender('Male');
    setComorbidities('Hypertension, Hyperlipidemia, Mild Chronic Kidney Disease');
    setAllergies('Penicillin (mild rash 10 years ago)');
    setMedications([
      { name: 'Lisinopril', dose: '20mg once daily', duration: 'Started 12 days ago' },
      { name: 'Atorvastatin', dose: '40mg once daily', duration: 'Ongoing for 2 years' },
      { name: 'Aspirin', dose: '75mg once daily', duration: 'Ongoing for 2 years' }
    ]);
    setSymptoms([
      { symptom: 'Sudden swelling of lower lip, tongue, and difficulty swallowing', onsetTime: '3 hours ago', severity: 'Severe' },
      { symptom: 'Throat tightness and hoarseness', onsetTime: '1 hour ago', severity: 'Severe' }
    ]);
    setClinicalNotes('Patient presented to the emergency triage with rapidly progressing angioedema of the oral mucosa without pruritus or hives. Hemodynamically stable but airway compromise risk.');
    setResult(null);
    setErrorMsg('');
  };

  const handleAnalyze = async () => {
    if (medications.length === 0) {
      setErrorMsg('Please add at least 1 medication taken by the patient.');
      return;
    }
    if (symptoms.length === 0) {
      setErrorMsg('Please add at least 1 adverse symptom or reaction faced by the patient.');
      return;
    }

    setErrorMsg('');
    setIsProcessing(true);
    setResult(null);

    const payload = {
      patientId: patientId.trim() || 'PAT-ANONYMOUS',
      age: patientAge,
      gender: patientGender,
      comorbidities,
      allergies,
      medications,
      adverseSymptoms: symptoms,
      clinicalNotes
    };

    try {
      const data = await analyzePharmacovigilanceADR(payload);
      setResult(data);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to complete Pharmacovigilance analysis. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToDB = async () => {
    if (!result) return;
    if (!patientId.trim()) {
      showAlert('Patient ID is mandatory to save reports in the EHR database.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await saveReportToDB('Pharmacovigilance', patientId, result);
      showAlert('Pharmacovigilance ADR report saved to EHR database successfully!', 'success');
    } catch (err) {
      showAlert('Failed to save report: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!result) return;
    downloadPDF('Pharmacovigilance', patientId || 'Anonymous', result);
  };

  const copyMedWatchSummary = () => {
    if (!result?.medWatchSummary?.summaryNarrative) return;
    navigator.clipboard.writeText(result.medWatchSummary.summaryNarrative);
    setCopiedMedWatch(true);
    setTimeout(() => setCopiedMedWatch(false), 2500);
  };

  const getRiskBadgeColor = (risk) => {
    const r = (risk || '').toLowerCase();
    if (r.includes('critical') || r.includes('life')) return '#ef4444';
    if (r.includes('severe')) return '#f97316';
    if (r.includes('moderate')) return '#eab308';
    return '#10b981';
  };

  const getCausalityBadgeColor = (cat) => {
    const c = (cat || '').toLowerCase();
    if (c.includes('certain')) return '#ef4444';
    if (c.includes('probable')) return '#f97316';
    if (c.includes('possible')) return '#eab308';
    return '#3b82f6';
  };

  // Reusable input styling for sleek, consistent clinical look
  const formInputStyle = {
    width: '100%',
    padding: '0.6rem 0.8rem',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    background: 'rgba(11, 15, 25, 0.85)',
    color: '#ffffff',
    fontSize: '0.86rem',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
  };

  const sectionCardStyle = {
    background: 'rgba(20, 25, 38, 0.75)',
    padding: '1.1rem',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.85rem'
  };

  return (
    <div className="module-container" style={{ display: 'flex', gap: '1.8rem', width: '100%', alignItems: 'stretch' }}>
      
      {/* Left Column: Doctor Input Form */}
      <div 
        className="glass-panel" 
        style={{ 
          flex: '1 1 50%', 
          minWidth: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          maxHeight: 'calc(100vh - 4.5rem)', 
          overflowY: 'auto', 
          overflowX: 'hidden',
          padding: '1.5rem',
          gap: '1.1rem'
        }}
      >
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', margin: '0 0 0.5rem 0', paddingBottom: '0.8rem' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.35rem', margin: 0, fontWeight: 700 }}>
              <ShieldAlert size={26} color="var(--primary)" /> Pharmacovigilance AI
            </h2>
            <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Adverse Drug Reaction (ADR) Surveillance & Causality Intelligence
            </p>
          </div>
          <button
            type="button"
            onClick={loadSampleCase}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              background: 'rgba(0, 240, 255, 0.08)',
              color: 'var(--primary)',
              fontSize: '0.82rem',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 240, 255, 0.18)';
              e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 240, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(0, 240, 255, 0.4)';
            }}
          >
            ⚡ Load Clinical Case
          </button>
        </div>

        {/* Patient Demographics */}
        <div style={sectionCardStyle}>
          <h4 style={{ color: 'var(--accent)', fontSize: '0.88rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
            <Activity size={16} /> Patient Demographics & Profile
          </h4>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.7rem' }}>
            <div>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Patient ID *</label>
              <input 
                type="text" 
                placeholder="e.g. PAT-9042" 
                value={patientId} 
                onChange={(e) => setPatientId(e.target.value)}
                style={formInputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Age</label>
              <input 
                type="number" 
                placeholder="e.g. 52" 
                value={patientAge} 
                onChange={(e) => setPatientAge(e.target.value)}
                style={formInputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Gender</label>
              <select 
                value={patientGender} 
                onChange={(e) => setPatientGender(e.target.value)}
                style={{ ...formInputStyle, cursor: 'pointer' }}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
            <div>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Comorbidities</label>
              <input 
                type="text" 
                placeholder="e.g. Hypertension, CKD, Diabetes" 
                value={comorbidities} 
                onChange={(e) => setComorbidities(e.target.value)}
                style={formInputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Known Drug Allergies</label>
              <input 
                type="text" 
                placeholder="e.g. Penicillin, Sulfa" 
                value={allergies} 
                onChange={(e) => setAllergies(e.target.value)}
                style={formInputStyle}
              />
            </div>
          </div>
        </div>

        {/* Section 1: Prescribed Medications */}
        <div style={sectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ color: 'var(--primary)', fontSize: '0.88rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
              <Pill size={16} /> 1. Prescribed / Administered Medications
              <span style={{ fontSize: '0.75rem', background: 'rgba(0, 229, 255, 0.15)', color: 'var(--primary)', padding: '0.1rem 0.5rem', borderRadius: '12px', fontWeight: 700 }}>
                {medications.length}
              </span>
            </h4>
          </div>

          {/* Form for adding medication - structured 2-row layout prevents any horizontal overflow */}
          <form onSubmit={handleAddMedication} style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.6rem' }}>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Drug Name *</label>
                <input 
                  type="text" 
                  placeholder="e.g. Lisinopril" 
                  value={medName} 
                  onChange={(e) => setMedName(e.target.value)}
                  style={formInputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Dosage</label>
                <input 
                  type="text" 
                  placeholder="e.g. 20mg OD" 
                  value={medDose} 
                  onChange={(e) => setMedDose(e.target.value)}
                  style={formInputStyle}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.6rem', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Administration / Duration</label>
                <input 
                  type="text" 
                  placeholder="e.g. Started 10 days ago" 
                  value={medDuration} 
                  onChange={(e) => setMedDuration(e.target.value)}
                  style={formInputStyle}
                />
              </div>
              <button 
                type="submit" 
                style={{ 
                  padding: '0.6rem 1.1rem', 
                  borderRadius: '8px', 
                  border: 'none', 
                  background: 'var(--primary)', 
                  color: '#000', 
                  fontWeight: '700', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.35rem', 
                  fontSize: '0.84rem',
                  height: '38px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 10px rgba(0, 229, 255, 0.25)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <Plus size={16} /> Add Drug
              </button>
            </div>
          </form>

          {/* List of Medications */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.2rem' }}>
            {medications.map((m, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '0.55rem 0.85rem', 
                  background: 'rgba(11, 15, 25, 0.9)', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(255,255,255,0.06)',
                  gap: '0.6rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                  <Pill size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: '600', color: '#fff', fontSize: '0.88rem' }}>{m.name}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({m.dose})</span>
                  <span style={{ fontSize: '0.74rem', background: 'rgba(255,255,255,0.08)', padding: '0.15rem 0.5rem', borderRadius: '4px', color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={11} /> {m.duration}
                  </span>
                </div>
                <button 
                  type="button"
                  onClick={() => handleRemoveMedication(idx)} 
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  title="Remove medication"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {medications.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic', margin: 0, padding: '0.3rem 0' }}>
                No medications added yet. Add all active drugs the patient is currently taking.
              </p>
            )}
          </div>
        </div>

        {/* Section 2: Adverse Reaction Symptoms */}
        <div style={sectionCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ color: 'var(--status-yellow)', fontSize: '0.88rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
              <AlertTriangle size={16} /> 2. Reported Adverse Reaction Symptoms
              <span style={{ fontSize: '0.75rem', background: 'rgba(251, 191, 36, 0.15)', color: 'var(--status-yellow)', padding: '0.1rem 0.5rem', borderRadius: '12px', fontWeight: 700 }}>
                {symptoms.length}
              </span>
            </h4>
          </div>

          {/* Quick preset chips */}
          <div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>
              Quick-Add Common Reactions:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {commonSymptoms.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleAddSymptom(s, 'Within 24-48 hrs', 'Severe')}
                  style={{
                    fontSize: '0.74rem',
                    padding: '0.28rem 0.65rem',
                    borderRadius: '20px',
                    background: 'rgba(234, 179, 8, 0.09)',
                    color: '#fef08a',
                    border: '1px solid rgba(234, 179, 8, 0.25)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(234, 179, 8, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(234, 179, 8, 0.09)';
                    e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.25)';
                  }}
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>

          {/* Form for adding symptoms - structured 2-row layout */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div>
              <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Adverse Symptom *</label>
              <input 
                type="text" 
                placeholder="e.g. Lip angioedema, Diffuse maculopapular rash" 
                value={currentSymptom} 
                onChange={(e) => setCurrentSymptom(e.target.value)}
                style={formInputStyle}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr auto', gap: '0.6rem', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Onset Time</label>
                <input 
                  type="text" 
                  placeholder="e.g. 2 hrs post-dose" 
                  value={symptomOnset} 
                  onChange={(e) => setSymptomOnset(e.target.value)}
                  style={formInputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>Severity</label>
                <select 
                  value={symptomSeverity} 
                  onChange={(e) => setSymptomSeverity(e.target.value)}
                  style={{ ...formInputStyle, cursor: 'pointer' }}
                >
                  <option value="Mild">Mild</option>
                  <option value="Moderate">Moderate</option>
                  <option value="Severe">Severe</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <button 
                type="button" 
                onClick={() => handleAddSymptom()}
                style={{ 
                  padding: '0.6rem 1.1rem', 
                  borderRadius: '8px', 
                  border: 'none', 
                  background: 'var(--status-yellow)', 
                  color: '#000', 
                  fontWeight: '700', 
                  cursor: 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.35rem', 
                  fontSize: '0.84rem',
                  height: '38px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 2px 10px rgba(251, 191, 36, 0.25)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <Plus size={16} /> Add Symptom
              </button>
            </div>
          </div>

          {/* List of Symptoms */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.2rem' }}>
            {symptoms.map((s, idx) => (
              <div 
                key={idx} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  padding: '0.55rem 0.85rem', 
                  background: 'rgba(11, 15, 25, 0.9)', 
                  borderRadius: '8px', 
                  border: '1px solid rgba(255,255,255,0.06)',
                  gap: '0.6rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                  <AlertTriangle size={15} color={s.severity === 'Critical' ? '#ef4444' : '#eab308'} style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: '500', color: '#fff', fontSize: '0.88rem', wordBreak: 'break-word' }}>{s.symptom}</span>
                  <span style={{ fontSize: '0.74rem', background: `${getRiskBadgeColor(s.severity)}20`, color: getRiskBadgeColor(s.severity), padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {s.severity}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Onset: {s.onsetTime}</span>
                </div>
                <button 
                  type="button"
                  onClick={() => handleRemoveSymptom(idx)} 
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0.25rem', borderRadius: '4px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  title="Remove symptom"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            {symptoms.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic', margin: 0, padding: '0.3rem 0' }}>
                No symptoms recorded yet. Add all adverse effects reported or observed.
              </p>
            )}
          </div>
        </div>

        {/* Section 3: Clinical Observations */}
        <div style={sectionCardStyle}>
          <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 500 }}>
            <FileText size={15} color="var(--primary)" /> Doctor's Clinical Notes / Vitals Observed
          </label>
          <textarea
            rows={3}
            placeholder="e.g. Patient presents with facial swelling 12 days after commencing ACE inhibitor therapy. No urticaria, no bronchospasm. BP 142/88 mmHg."
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value)}
            style={{ ...formInputStyle, minHeight: '75px', resize: 'vertical', lineHeight: '1.5' }}
          />
        </div>

        {errorMsg && (
          <p style={{ color: 'var(--status-red)', margin: '0', fontSize: '0.86rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            ⚠️ {errorMsg}
          </p>
        )}

        {/* Action Trigger */}
        <div style={{ display: 'flex', gap: '0.8rem', marginTop: 'auto', paddingTop: '0.4rem', flexShrink: 0 }}>
          <button
            onClick={handleAnalyze}
            disabled={isProcessing}
            style={{
              flex: 2,
              padding: '0.9rem',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(90deg, #00f0ff, #7000ff)',
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '0.95rem',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              boxShadow: '0 4px 15px rgba(0, 240, 255, 0.3)',
              transition: 'all 0.2s ease',
              opacity: isProcessing ? 0.75 : 1
            }}
          >
            {isProcessing ? <Loader2 size={19} className="spin" /> : <Sparkles size={19} />}
            {isProcessing ? 'COMPUTING ADR CAUSALITY...' : 'RUN ADR CAUSALITY ASSESSMENT'}
          </button>
          <button
            onClick={() => {
              setMedications([]);
              setSymptoms([]);
              setClinicalNotes('');
              setPatientId('');
              setPatientAge('');
              setComorbidities('');
              setAllergies('');
              setResult(null);
              setErrorMsg('');
            }}
            disabled={isProcessing}
            style={{
              flex: 0.6,
              padding: '0.9rem',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-muted)',
              fontWeight: 'bold',
              fontSize: '0.9rem',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Right Column: AI Analysis & Pharmacovigilance Report */}
      <div 
        className="glass-panel" 
        style={{ 
          flex: '1 1 50%', 
          minWidth: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          maxHeight: 'calc(100vh - 4.5rem)', 
          overflowY: 'auto', 
          overflowX: 'hidden',
          padding: '1.5rem'
        }}
      >
        <div className="section-header" style={{ margin: '0 0 1rem 0', paddingBottom: '0.8rem' }}>
          <h2 style={{ fontSize: '1.35rem', margin: 0, fontWeight: 700 }}>Pharmacovigilance Intelligence Report</h2>
          <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>WHO-UMC & Naranjo Algorithm Clinical Evaluation</p>
        </div>

        {isProcessing ? (
          <div className="empty-state" style={{ padding: '4rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={52} className="spin" color="var(--primary)" />
            <h3 style={{ marginTop: '1.5rem', color: '#fff', fontSize: '1.15rem' }}>Analyzing Pharmacological Causality...</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '420px', textAlign: 'center', marginTop: '0.5rem', fontSize: '0.88rem', lineHeight: '1.6' }}>
              Cross-referencing drug onset timelines, biochemical pathways, dechallenge risk, and adverse event registries...
            </p>
          </div>
        ) : result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            
            {/* Top Causality Card */}
            <div 
              style={{ 
                background: 'rgba(20, 25, 38, 0.85)', 
                padding: '1.3rem', 
                borderRadius: '12px', 
                borderLeft: `5px solid ${getRiskBadgeColor(result.riskLevel)}`,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                borderRight: '1px solid rgba(255,255,255,0.08)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.8rem' }}>
                <div style={{ minWidth: '200px' }}>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 600 }}>
                    OFFENDING AGENT IDENTIFIED
                  </span>
                  <h3 style={{ fontSize: '1.55rem', color: '#fff', margin: '0.2rem 0', fontWeight: 800 }}>
                    {result.causalityAssessment?.culpritDrug || 'Suspected Drug'}
                  </h3>
                  <p style={{ color: 'var(--accent)', fontWeight: '600', fontSize: '1rem', margin: 0 }}>
                    {result.causalityAssessment?.suspectedReaction}
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                  <span 
                    style={{ 
                      padding: '0.35rem 0.8rem', 
                      borderRadius: '20px', 
                      background: `${getCausalityBadgeColor(result.causalityAssessment?.category)}20`, 
                      color: getCausalityBadgeColor(result.causalityAssessment?.category), 
                      border: `1px solid ${getCausalityBadgeColor(result.causalityAssessment?.category)}`,
                      fontWeight: 'bold',
                      fontSize: '0.82rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    WHO-UMC: {result.causalityAssessment?.category || 'Probable'} (Score: {result.causalityAssessment?.score ?? 8}/9)
                  </span>
                  <span 
                    style={{ 
                      padding: '0.3rem 0.75rem', 
                      borderRadius: '20px', 
                      background: `${getRiskBadgeColor(result.riskLevel)}20`, 
                      color: getRiskBadgeColor(result.riskLevel),
                      fontWeight: 'bold',
                      fontSize: '0.82rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Risk Level: {result.riskLevel}
                  </span>
                </div>
              </div>

              {/* Urgency Directive */}
              {result.urgency && (
                <div style={{ marginTop: '0.9rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.12)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', fontSize: '0.88rem', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                  <div>
                    <strong style={{ color: '#fff' }}>CLINICAL DIRECTIVE:</strong> {result.urgency}
                  </div>
                </div>
              )}
            </div>

            {/* Pharmacological Mechanism */}
            <div style={sectionCardStyle}>
              <h4 style={{ color: 'var(--primary)', margin: 0, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
                <Activity size={16} /> Biochemical & Pharmacological Mechanism
              </h4>
              <p style={{ color: '#cbd5e1', lineHeight: '1.6', fontSize: '0.88rem', margin: 0 }}>
                {result.causalityAssessment?.mechanism}
              </p>
            </div>

            {/* Symptom-Drug Correlation Matrix */}
            {result.reactionDetails && result.reactionDetails.length > 0 && (
              <div style={sectionCardStyle}>
                <h4 style={{ color: 'var(--status-yellow)', margin: 0, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
                  <AlertTriangle size={16} /> Symptom-Medication Causality Correlation
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {result.reactionDetails.map((rd, i) => (
                    <div key={i} style={{ padding: '0.75rem 0.95rem', background: 'rgba(11, 15, 25, 0.9)', borderRadius: '8px', borderLeft: '3px solid var(--primary)', borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: '600', color: '#fff', fontSize: '0.88rem' }}>{rd.symptom}</span>
                        <span style={{ fontSize: '0.74rem', color: 'var(--primary)', background: 'rgba(0,240,255,0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600 }}>
                          Linked to: {rd.correlatedMedication} ({rd.likelihood} Likelihood)
                        </span>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: '1.5', margin: 0 }}>
                        {rd.clinicalPathology}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency Action Plan */}
            {result.emergencyActions && result.emergencyActions.length > 0 && (
              <div style={{ ...sectionCardStyle, border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(35, 20, 25, 0.65)' }}>
                <h4 style={{ color: '#f87171', margin: 0, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
                  <ShieldAlert size={16} /> Immediate Clinical Counter-Actions
                </h4>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#fecaca', lineHeight: '1.65', fontSize: '0.88rem' }}>
                  {result.emergencyActions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Dechallenge & Rechallenge Guidance */}
            {result.dechallengeRechallenge && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem' }}>
                <div style={{ background: 'rgba(20, 25, 38, 0.75)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <h5 style={{ color: 'var(--primary)', margin: '0 0 0.4rem 0', fontSize: '0.84rem', fontWeight: 600 }}>Dechallenge (Discontinuation)</h5>
                  <p style={{ color: '#fff', fontSize: '0.84rem', margin: '0 0 0.3rem 0', lineHeight: '1.4' }}>
                    {result.dechallengeRechallenge.dechallengeAction}
                  </p>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.74rem', display: 'block' }}>
                    Timeline: {result.dechallengeRechallenge.expectedCourse}
                  </span>
                </div>
                <div style={{ background: 'rgba(20, 25, 38, 0.75)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <h5 style={{ color: '#f87171', margin: '0 0 0.4rem 0', fontSize: '0.84rem', fontWeight: 600 }}>
                    Rechallenge: {result.dechallengeRechallenge.rechallengeSafe ? 'Conditional' : 'CONTRAINDICATED'}
                  </h5>
                  <p style={{ color: '#cbd5e1', fontSize: '0.84rem', margin: 0, lineHeight: '1.4' }}>
                    {result.dechallengeRechallenge.rechallengeWarning}
                  </p>
                </div>
              </div>
            )}

            {/* Safe Therapeutic Alternatives */}
            {result.safeAlternatives && result.safeAlternatives.length > 0 && (
              <div style={sectionCardStyle}>
                <h4 style={{ color: 'var(--status-green)', margin: 0, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
                  <CheckCircle size={16} /> Recommended Safe Alternative Therapies
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {result.safeAlternatives.map((alt, i) => (
                    <div key={i} style={{ padding: '0.75rem 0.95rem', background: 'rgba(11, 15, 25, 0.9)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{alt.condition}</span>
                        <div style={{ color: '#fff', fontWeight: '600', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                          <ArrowRight size={14} color="var(--status-green)" /> {alt.recommendedAlternative}
                        </div>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '320px', textAlign: 'right' }}>
                        {alt.rationale}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Regulatory PvPI / MedWatch Reporting Draft */}
            {result.medWatchSummary && (
              <div style={{ background: 'rgba(0, 240, 255, 0.04)', padding: '1.1rem', borderRadius: '10px', border: '1px solid rgba(0, 240, 255, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h4 style={{ color: 'var(--primary)', fontSize: '0.88rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
                    <FileText size={16} /> Regulatory PvPI / FDA MedWatch Report Draft
                  </h4>
                  <button
                    onClick={copyMedWatchSummary}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {copiedMedWatch ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                    {copiedMedWatch ? 'Copied' : 'Copy Draft'}
                  </button>
                </div>
                <p style={{ color: '#e2e8f0', fontSize: '0.84rem', lineHeight: '1.6', margin: 0 }}>
                  {result.medWatchSummary.summaryNarrative}
                </p>
                <div style={{ marginTop: '0.6rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  Reportable Event Term: <span style={{ color: '#fff' }}>{result.medWatchSummary.adverseEventTerm}</span> • Agency: <span style={{ color: '#fff' }}>{result.medWatchSummary.regulatoryAgency}</span>
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', marginTop: '0.5rem', paddingTop: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                onClick={handleSaveToDB}
                disabled={isSaving}
                style={{
                  flex: '1 1 200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.85rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--primary)',
                  color: '#000',
                  fontWeight: 'bold',
                  fontSize: '0.88rem',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 10px rgba(0, 229, 255, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                {isSaving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
                {isSaving ? 'Saving to EHR...' : 'Save to EHR Database'}
              </button>
              <button
                onClick={handleDownloadPDF}
                style={{
                  flex: '1 1 200px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--primary)',
                  background: 'rgba(0, 240, 255, 0.05)',
                  color: 'var(--primary)',
                  fontWeight: 'bold',
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Download size={18} />
                Download ADR Report (PDF)
              </button>
            </div>

          </div>
        ) : (
          <div className="empty-state" style={{ padding: '4rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={60} color="rgba(255,255,255,0.2)" />
            <h3 style={{ marginTop: '1.2rem', color: '#fff', fontSize: '1.15rem', fontWeight: 600 }}>AI ADR Surveillance Ready</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '420px', lineHeight: '1.6', marginTop: '0.5rem', fontSize: '0.88rem' }}>
              Add the patient's medications and the adverse symptoms they are experiencing on the left. The AI will evaluate pharmacological causality, identify the offending drug, compute Naranjo scores, and recommend safe alternatives.
            </p>
          </div>
        )}
      </div>

    </div>
  );
};

export default Pharmacovigilance;

