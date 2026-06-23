import React, { useState, useRef } from 'react';
import { Mic, Loader2, Save, Activity, FileText } from 'lucide-react';
import { startListening } from '../services/SpeechService';
import { generateSOAPNote } from '../services/AIEngine';

const AutoScribe = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [soapNote, setSoapNote] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const recognitionRef = useRef(null);

  const toggleRecording = () => {
    setErrorMsg('');
    if (isRecording) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsRecording(false);
      processTranscript();
    } else {
      setTranscript('');
      setSoapNote(null);
      recognitionRef.current = startListening(
        'en-US',
        (interim, final) => {
          if (interim) setInterimTranscript(interim);
          if (final) {
            setTranscript((prev) => prev + ' ' + final);
            setInterimTranscript('');
          }
        },
        () => {
          // In continuous mode, if it stops unexpectedly while still recording, we might auto-restart it in a real app.
          // For now, if it drops, we stop.
          if (isRecording) {
             setIsRecording(false);
             processTranscript();
          }
        },
        (err) => {
          setIsRecording(false);
          setErrorMsg(err);
        }
      );
      if (recognitionRef.current) setIsRecording(true);
    }
  };

  const processTranscript = async () => {
    if (!transcript.trim()) return;
    setIsProcessing(true);
    try {
      const note = await generateSOAPNote(transcript);
      setSoapNote(note);
    } catch (err) {
      setErrorMsg("Failed to generate SOAP note. AI Server issue.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="module-container" style={{ display: 'flex', gap: '2rem' }}>
      {/* Left Column: Recording & Transcript */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="section-header">
          <h2>Auto-Scribe</h2>
          <p>Ambient Clinical Intelligence</p>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2rem' }}>
          <button 
            className={`mic-button ${isRecording ? 'listening' : ''}`} 
            onClick={toggleRecording}
            disabled={isProcessing}
          >
            {isRecording ? <Activity size={48} /> : <Mic size={48} />}
          </button>
          
          <div className="status-text">
            {isRecording ? "LISTENING TO CONSULTATION..." : isProcessing ? "ANALYZING TRANSCRIPT..." : "READY TO RECORD"}
          </div>

          <div className="transcript-box" style={{ width: '100%', flex: 1, minHeight: '300px' }}>
            {transcript || interimTranscript ? (
              <p>
                {transcript}
                <span style={{ color: 'var(--primary)', opacity: 0.7 }}>{interimTranscript}</span>
              </p>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '4rem' }}>
                Press the microphone to start recording the doctor-patient conversation. The AI will automatically ignore small talk and extract medical facts.
              </p>
            )}
            {errorMsg && <p style={{ color: 'var(--status-red)', marginTop: '1rem' }}>{errorMsg}</p>}
          </div>
        </div>
      </div>

      {/* Right Column: Generated SOAP Note */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="section-header">
          <h2>SOAP Note</h2>
          <p>AI Generated Clinical Documentation</p>
        </div>

        {isProcessing ? (
          <div className="empty-state">
            <Loader2 size={48} className="spin" />
            <p>Extracting Medical Entities...</p>
          </div>
        ) : soapNote ? (
          <div className="ehr-card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            <div className="data-group">
              <h4 style={{ color: 'var(--accent)' }}>[S] Subjective</h4>
              <p style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>{soapNote.subjective}</p>
            </div>
            
            <div className="data-group">
              <h4 style={{ color: 'var(--status-yellow)' }}>[O] Objective</h4>
              <p style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>{soapNote.objective || 'No objective vitals mentioned.'}</p>
            </div>
            
            <div className="data-group">
              <h4 style={{ color: 'var(--status-red)' }}>[A] Assessment</h4>
              <p style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>{soapNote.assessment}</p>
            </div>
            
            <div className="data-group">
              <h4 style={{ color: 'var(--status-green)' }}>[P] Plan</h4>
              <p style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>{soapNote.plan}</p>
            </div>

            <div className="data-group">
              <h4>Keywords Extracted</h4>
              <div className="tag-list">
                {soapNote.extractedKeywords?.map((kw, i) => (
                  <span key={i} className="tag">{kw}</span>
                ))}
              </div>
            </div>

            <button style={{ 
              marginTop: 'auto', background: 'var(--primary)', color: '#000', 
              border: 'none', padding: '1rem', borderRadius: '8px', 
              fontWeight: 'bold', cursor: 'pointer', display: 'flex', 
              justifyContent: 'center', alignItems: 'center', gap: '0.5rem' 
            }}>
              <Save size={20} /> Export to EHR
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <FileText size={64} />
            <p>SOAP Note will appear here after recording stops.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutoScribe;
