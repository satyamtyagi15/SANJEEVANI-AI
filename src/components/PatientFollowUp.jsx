import React, { useState } from 'react';
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { evaluateRelapseRisk } from '../services/AIEngine';
import { Activity, ShieldCheck, AlertCircle } from 'lucide-react';

const PatientFollowUp = ({ patientId, onClose }) => {
  const [symptom, setSymptom] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // Always call hooks at the top level
  const info = useQuery(api.patients.getPatientDischargeInfo, { patientId });
  const logAlertMut = useMutation(api.patients.logGuardianAlert);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (info === undefined) {
      alert("Still connecting to Sanjeevani AI Cloud, please wait a moment...");
      return;
    }
    
    if (info === null) {
      alert(`Error: No discharge records found for patient ID ${patientId}. Please check the link.`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Run the RAG AI Agent
      const aiAnalysis = await evaluateRelapseRisk(
        info.dischargeNotes, 
        symptom, 
        info.diagnosis
      );

      // Log alert to Doctor Dashboard via Convex
      await logAlertMut({
        patientId,
        reportedSymptoms: symptom,
        aiRiskAssessment: aiAnalysis.aiRiskAssessment,
        isCritical: aiAnalysis.isCritical,
      });

      setResult(aiAnalysis);
    } catch (err) {
      alert("Failed to analyze symptom: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--bg-panel)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
      <div style={{ background: '#18181b', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '500px', border: '1px solid #3f3f46', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
        
        <h2 style={{ color: '#fff', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck color="#10b981" /> Guardian Check-In
        </h2>
        
        <p style={{ color: '#a1a1aa', marginBottom: '1.5rem' }}>
          Hello {patientId}. This is your automated 24-hour follow-up. How are you feeling today?
        </p>

        {!result ? (
          <form onSubmit={handleSubmit}>
            <textarea 
              value={symptom}
              onChange={(e) => setSymptom(e.target.value)}
              placeholder="E.g., I'm feeling fine, or My chest is hurting again..."
              style={{ width: '100%', height: '100px', padding: '1rem', background: 'var(--bg-elevated)', border: '1px solid #52525b', borderRadius: '8px', color: '#fff', marginBottom: '1rem', resize: 'none' }}
              required
            />
            <button 
              type="submit" 
              disabled={isSubmitting}
              style={{ width: '100%', padding: '1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
            >
              {isSubmitting ? <Activity className="spin" size={20} /> : "Submit Update"}
            </button>
          </form>
        ) : (
          <div style={{ background: result.isCritical ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', border: `1px solid ${result.isCritical ? '#ef4444' : '#10b981'}`, padding: '1rem', borderRadius: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: result.isCritical ? '#ef4444' : '#10b981', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              <AlertCircle /> {result.isCritical ? "CRITICAL RISK DETECTED" : "NORMAL RECOVERY"}
            </div>
            <p style={{ color: '#e4e4e7', margin: '0 0 1rem 0' }}>{result.aiRiskAssessment}</p>
            <strong style={{ color: '#93c5fd' }}>Action: {result.recommendedAction}</strong>
            <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#a1a1aa' }}>Your doctor has been notified in real-time.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientFollowUp;
