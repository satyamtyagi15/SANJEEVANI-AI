import React, { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, Save, Activity, FileText, Download, Sparkles, RotateCcw } from 'lucide-react';
import { startListening } from '../services/SpeechService';
import { generateSOAPNote } from '../services/AIEngine';
import { saveReportToDB, downloadPDF } from '../services/ReportService';
import { showAlert } from '../services/AlertService';
import CustomLanguageSelector from './CustomLanguageSelector';

const AutoScribe = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState('hi-IN');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [soapNote, setSoapNote] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [patientId, setPatientId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const recognitionRef = useRef(null);
  const transcriptRef = useRef('');
  const interimRef = useRef('');
  const isRecordingRef = useRef(false);

  // Sync refs when state changes manually
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const handleSaveReport = async () => {
    if (!soapNote) return;
    if (!patientId.trim()) {
      showAlert('Patient ID is mandatory to save reports in the EHR system.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await saveReportToDB('AutoScribe', patientId, soapNote);
      showAlert('SOAP Note saved to database successfully!', 'success');
    } catch (err) {
      showAlert('Failed to save report: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    downloadPDF('AutoScribe', patientId || 'Anonymous', soapNote);
  };

  const stopRecordingAndProcess = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn("Recognition stop error:", e);
      }
    }

    // Merge any pending interim transcript into final transcript
    const fullText = (transcriptRef.current + ' ' + interimRef.current).trim();
    transcriptRef.current = fullText;
    interimRef.current = '';
    setTranscript(fullText);
    setInterimTranscript('');

    if (fullText) {
      processTranscript(fullText);
    }
  };

  const startRecording = () => {
    setErrorMsg('');
    transcriptRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setSoapNote(null);
    isRecordingRef.current = true;
    setIsRecording(true);

    recognitionRef.current = startListening(
      language,
      (interim, final) => {
        if (interim) {
          interimRef.current = interim;
          setInterimTranscript(interim);
        }
        if (final) {
          transcriptRef.current = (transcriptRef.current + ' ' + final).trim();
          interimRef.current = '';
          setTranscript(transcriptRef.current);
          setInterimTranscript('');
        }
      },
      () => {
        // Recognition ended by browser (silence or timeout)
        if (isRecordingRef.current) {
          stopRecordingAndProcess();
        }
      },
      (err) => {
        if (err && typeof err === 'string' && err.includes('no-speech')) {
          if (transcriptRef.current || interimRef.current) {
            stopRecordingAndProcess();
          } else {
            isRecordingRef.current = false;
            setIsRecording(false);
            setErrorMsg("No speech detected. Please speak closer to the mic.");
          }
        } else {
          isRecordingRef.current = false;
          setIsRecording(false);
          setErrorMsg(err || "Microphone error. Please check browser permissions.");
        }
      }
    );

    if (!recognitionRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    setErrorMsg('');
    if (isRecordingRef.current || isRecording) {
      stopRecordingAndProcess();
    } else {
      startRecording();
    }
  };

  const processTranscript = async (textOverride) => {
    const raw = typeof textOverride === 'string' 
      ? textOverride 
      : (transcriptRef.current + ' ' + interimRef.current).trim() || transcript.trim();
      
    if (!raw) {
      setErrorMsg("Please record or enter a consultation transcript first.");
      return;
    }

    setErrorMsg('');
    setIsProcessing(true);
    try {
      const note = await generateSOAPNote(raw);
      setSoapNote(note);
    } catch (err) {
      setErrorMsg("Failed to generate SOAP note. AI Server issue.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    transcriptRef.current = '';
    interimRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    setSoapNote(null);
    setErrorMsg('');
  };

  return (
    <div className="module-container" style={{ display: 'flex', gap: '2rem' }}>
      {/* Left Column: Recording & Transcript */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2>Auto-Scribe</h2>
            <p>Ambient Clinical Intelligence</p>
          </div>
          <div style={{ minWidth: '180px' }}>
            <CustomLanguageSelector 
              language={language}
              setLanguage={setLanguage}
              disabled={isRecording || isProcessing}
            />
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem' }}>
          <button 
            className={`mic-button ${isRecording ? 'listening' : ''}`} 
            onClick={toggleRecording}
            disabled={isProcessing}
            title={isRecording ? "Click to Stop Recording" : "Click to Start Recording"}
          >
            {isRecording ? <Activity size={48} /> : <Mic size={48} />}
          </button>
          
          <div className="status-text">
            {isRecording ? "LISTENING TO CONSULTATION..." : isProcessing ? "ANALYZING TRANSCRIPT..." : "READY TO RECORD"}
          </div>

          <div className="transcript-box" style={{ width: '100%', flex: 1, minHeight: '260px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              {transcript || interimTranscript ? (
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                  {transcript}
                  {interimTranscript && (
                    <span style={{ color: 'var(--primary)', opacity: 0.8, marginLeft: transcript ? '0.5rem' : '0' }}>
                      {interimTranscript}
                    </span>
                  )}
                </p>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '3rem' }}>
                  Press the microphone to start recording the doctor-patient conversation in any language. The AI will automatically extract clinical facts and format a SOAP note.
                </p>
              )}
            </div>

            {errorMsg && (
              <p style={{ color: 'var(--status-red)', marginTop: '0.8rem', fontSize: '0.9rem' }}>
                {errorMsg}
              </p>
            )}

            {/* Action Bar for Transcript */}
            {(transcript || interimTranscript) && !isRecording && (
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={() => processTranscript()}
                  disabled={isProcessing}
                  style={{
                    flex: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--primary)',
                    color: '#000',
                    fontWeight: 'bold',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  {isProcessing ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
                  {isProcessing ? 'Generating SOAP Note...' : 'Generate SOAP Note'}
                </button>
                <button
                  onClick={handleClear}
                  disabled={isProcessing}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.65rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  <RotateCcw size={15} />
                  Clear
                </button>
              </div>
            )}
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
            <p style={{ marginTop: '1rem', color: 'var(--primary)' }}>Extracting Medical Entities & Structuring SOAP Note...</p>
          </div>
        ) : soapNote ? (
          <div className="ehr-card" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            
            <div className="data-group">
              <h4 style={{ color: 'var(--accent)' }}>[S] Subjective</h4>
              <p style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px' }}>{soapNote.subjective}</p>
            </div>
            
            <div className="data-group">
              <h4 style={{ color: 'var(--status-yellow)' }}>[O] Objective</h4>
              <p style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px' }}>{soapNote.objective || 'No objective vitals mentioned.'}</p>
            </div>
            
            <div className="data-group">
              <h4 style={{ color: 'var(--status-red)' }}>[A] Assessment</h4>
              <p style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px' }}>{soapNote.assessment}</p>
            </div>
            
            <div className="data-group">
              <h4 style={{ color: 'var(--status-green)' }}>[P] Plan</h4>
              <p style={{ background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '8px' }}>{soapNote.plan}</p>
            </div>

            <div className="data-group">
              <h4>Keywords Extracted</h4>
              <div className="tag-list">
                {soapNote.extractedKeywords?.map((kw, i) => (
                  <span key={i} className="tag">{kw}</span>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Assign Patient ID (Mandatory)*</label>
              <input 
                type="text" 
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="e.g. PAT-90812"
                style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-elevated)', color: '#fff', fontSize: '1rem' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <button 
                onClick={handleSaveReport}
                disabled={isSaving}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.8rem', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: '#000', fontWeight: 'bold', cursor: isSaving ? 'not-allowed' : 'pointer' }}
              >
                {isSaving ? <Loader2 size={18} className="spin" /> : <Save size={18} />}
                {isSaving ? 'Saving...' : 'Save Report'}
              </button>
              <button 
                onClick={handleDownload}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontWeight: 'bold', cursor: 'pointer' }}
              >
                <Download size={18} />
                Download PDF
              </button>
              <button 
                onClick={handleClear}
                disabled={isSaving}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontWeight: 'bold', cursor: isSaving ? 'not-allowed' : 'pointer' }}
              >
                Clear
              </button>
            </div>
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
