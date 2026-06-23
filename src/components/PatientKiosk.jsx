import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, AlertCircle, Send, FileText, Camera, CheckCircle, MapPin, MessageSquare, Volume2 } from 'lucide-react';
import { startListening } from '../services/SpeechService';
import { processTriage, generateFollowUpQuestion, runSafetyReviewAgent, runBillingAgent, runPharmacovigilanceAgent } from '../services/AIEngine';
import { scanMedicalRecord, scanRadiologyImage } from '../services/VisionService';
import TouchlessVitals from './TouchlessVitals';

const PatientKiosk = ({ onTriageComplete }) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [language, setLanguage] = useState('hi-IN');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [step, setStep] = useState('symptoms'); // 'symptoms' | 'followup' | 'vitals'
  const [currentTriageData, setCurrentTriageData] = useState(null);
  
  const [showTextFallback, setShowTextFallback] = useState(true);
  const [manualText, setManualText] = useState('');
  const [patientLocation, setPatientLocation] = useState('');
  const [patientCoords, setPatientCoords] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Chat History for interactive triage
  const [chatHistory, setChatHistory] = useState([]);
  const [currentFollowUpQuestion, setCurrentFollowUpQuestion] = useState("");

  // OCR Vision State
  const [pastMedicalHistory, setPastMedicalHistory] = useState(null);
  const [isScanningReport, setIsScanningReport] = useState(false);

  // Computer Vision AI state
  const [visualFindings, setVisualFindings] = useState(null);
  const [isScanningVision, setIsScanningVision] = useState(false);

  const recognitionRef = useRef(null);

  const [availableLanguages, setAvailableLanguages] = useState([]);

  // Fetch all available voices dynamically from the browser
  useEffect(() => {
    const loadVoices = () => {
      if (!('speechSynthesis' in window)) return;
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const langMap = new Map();
        voices.forEach(v => {
          if (v.lang && !langMap.has(v.lang)) {
            try {
              const label = new Intl.DisplayNames(['en'], { type: 'language' }).of(v.lang) || v.lang;
              langMap.set(v.lang, `${label} (${v.lang})`);
            } catch (e) {
              langMap.set(v.lang, v.lang);
            }
          }
        });
        
        const langs = Array.from(langMap.entries()).map(([code, label]) => ({ code, label }));
        langs.sort((a, b) => a.label.localeCompare(b.label));
        setAvailableLanguages(langs);
      }
    };

    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      // Adjust pitch and rate for a calmer, clearer "Doctor" voice
      utterance.pitch = 0.85; 
      utterance.rate = 0.9; // Slightly slower for maximum clarity across all languages
      utterance.lang = language; // Force the exact selected language
      
      const voices = window.speechSynthesis.getVoices();
      
      let bestVoice = null;
      let highestScore = -1;

      for (const v of voices) {
        // Must match the exact language code, or at least the language prefix (e.g., 'mr' for 'mr-IN')
        const isExactLang = v.lang === language;
        const isPrefixLang = v.lang.startsWith(language.split('-')[0]);

        if (isExactLang || isPrefixLang) {
          let score = 0;
          
          if (isExactLang) score += 50; // Exact match is heavily prioritized
          
          const name = v.name.toLowerCase();
          
          // Male voices preferred (+20)
          if (name.includes('male') || name.includes('hemant') || name.includes('madhur') || name.includes('david') || name.includes('mark') || name.includes('guy') || name.includes('pablo')) {
            score += 20;
          }

          // High quality / Cloud / Premium voices are critical for clarity (+15)
          if (name.includes('google') || name.includes('premium') || name.includes('natural') || name.includes('online')) {
            score += 15;
          }

          // Microsoft default voices are a decent fallback (+10)
          if (name.includes('microsoft')) {
            score += 10;
          }

          if (score > highestScore) {
            highestScore = score;
            bestVoice = v;
          }
        }
      }

      if (bestVoice) utterance.voice = bestVoice;
      window.speechSynthesis.speak(utterance);
    }
  };

  const fetchLiveLocation = () => {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          setPatientCoords({ lat: latitude, lon: longitude });
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await response.json();
          const area = data.address.suburb || data.address.neighbourhood || data.address.city_district || data.address.city || data.address.town || 'Unknown Area';
          setPatientLocation(area);
        } catch (err) {
          console.error("Geocoding failed", err);
          setErrorMsg("Failed to fetch address. Please enter manually.");
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        setErrorMsg("Location access denied. Please enter manually.");
      }
    );
  };

  const toggleListening = () => {
    setErrorMsg(null);
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      setTranscript('');
      setInterimTranscript('');
      recognitionRef.current = startListening(
        language,
        (interim, final) => {
          if (interim) setInterimTranscript(interim);
          if (final) {
            setTranscript((prev) => prev + ' ' + final);
            setInterimTranscript('');
          }
        },
        () => {
          setIsListening(false);
        },
        (errorType) => {
          setIsListening(false);
          if (errorType.includes('no-speech')) {
            setErrorMsg("No speech detected. Please check your mic or try speaking closer.");
          } else if (errorType.includes('not-allowed')) {
            setErrorMsg("Microphone access denied. Please allow mic access or use text input.");
          } else {
            setErrorMsg(errorType);
          }
        }
      );
      setIsListening(true);
    }
  };

  const handleFollowUpCycle = async (newHistory) => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      let languageName = language;
      try {
        languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(language) || language;
      } catch (e) {}

      const aiFollowUp = await generateFollowUpQuestion(newHistory, languageName, pastMedicalHistory, visualFindings);
      
      if (aiFollowUp.readyForTriage || newHistory.length >= 6) { // Max 3 turns (user-ai-user-ai-user-ai)
        const triageData = await processTriage(newHistory, languageName, pastMedicalHistory, visualFindings);
        setCurrentTriageData(triageData);
        setStep('vitals');
      } else {
        // Ask next question
        const questionText = aiFollowUp.question;
        setCurrentFollowUpQuestion(questionText);
        setChatHistory([...newHistory, { role: 'ai', content: questionText }]);
        speakText(questionText);
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to connect to AI. Generating immediate report.");
      try {
        const triageData = await processTriage(newHistory, language, pastMedicalHistory, visualFindings);
        setCurrentTriageData(triageData);
      } catch (e) {
        setErrorMsg("Critical AI Error. Please seek immediate staff assistance.");
      }
      setStep('vitals');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    const finalTranscript = manualText || transcript;
    if (!finalTranscript) return;
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }

    if (step === 'symptoms') {
      const newHistory = [{ role: 'user', content: finalTranscript }];
      setChatHistory(newHistory);
      setTranscript('');
      setManualText('');
      setStep('followup');
      await handleFollowUpCycle(newHistory);
    } else if (step === 'followup') {
      const newHistory = [...chatHistory, { role: 'user', content: finalTranscript }];
      setChatHistory(newHistory);
      setTranscript('');
      setManualText('');
      await handleFollowUpCycle(newHistory);
    }
  };

  const handleReportUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanningReport(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result;
      try {
        const historyData = await scanMedicalRecord(base64String);
        setPastMedicalHistory(historyData);
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setIsScanningReport(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVitalsComplete = async (bpm, painIndex) => {
    setIsProcessing(true);
    
    // Calculate dynamic wait time based on AI Priority
    let waitTime = "45 mins";
    if (currentTriageData.priority === 'red') waitTime = "Immediate (0 mins)";
    else if (currentTriageData.priority === 'yellow') waitTime = "15 mins";
    else waitTime = `${Math.floor(Math.random() * 30) + 30} mins`;

    // Multi-Agent Execution Pipeline
    const [safetyReview, billingInfo, allergyAlert] = await Promise.all([
      runSafetyReviewAgent(currentTriageData),
      runBillingAgent(currentTriageData),
      runPharmacovigilanceAgent(currentTriageData, pastMedicalHistory)
    ]);

    const finalData = {
      ...currentTriageData,
      measuredBpm: bpm,
      visualPainIndex: painIndex,
      estimatedWaitTime: waitTime,
      safetyReview: safetyReview,
      billingInfo: billingInfo,
      allergyAlert: allergyAlert,
      location: patientLocation,
      coords: patientCoords
    };
    
    setIsProcessing(false);
    onTriageComplete(finalData); // Send to Doctor Dashboard
    
    // Speak wait time
    speakText(`Evaluation complete. Your estimated wait time is ${waitTime}.`);

    // Reset Kiosk for next patient
    setStep('symptoms');
    setTranscript('');
    setManualText('');
    setChatHistory([]);
    setCurrentTriageData(null);
  };

  const handleVisionUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanningVision(true);
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64Image = reader.result;
        const analysis = await scanRadiologyImage(base64Image);
        const findingString = `Visual findings: ${analysis.findings}. Impression: ${analysis.impression}. Severity: ${analysis.severity}.`;
        setVisualFindings(findingString);
        speakText("Visual symptom successfully analyzed by AI. Please continue speaking your symptoms.");
      } catch (err) {
        console.error("Vision Upload Error:", err);
        setErrorMsg("Failed to analyze image: " + err.message);
      } finally {
        setIsScanningVision(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="kiosk-section">
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <select 
          className="language-selector" 
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={step === 'vitals'}
          style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid var(--glass-border)' }}
        >
          <optgroup label="Indian Regional">
            <option value="hi-IN">हिन्दी (Hindi)</option>
            <option value="en-IN">English (India)</option>
            <option value="bn-IN">বাংলা (Bengali)</option>
            <option value="mr-IN">मराठी (Marathi)</option>
            <option value="te-IN">తెలుగు (Telugu)</option>
            <option value="ta-IN">தமிழ் (Tamil)</option>
            <option value="gu-IN">ગુજરાતી (Gujarati)</option>
            <option value="kn-IN">ಕನ್ನಡ (Kannada)</option>
            <option value="ml-IN">മലയാളം (Malayalam)</option>
            <option value="pa-IN">ਪੰਜਾਬੀ (Punjabi)</option>
          </optgroup>
          <optgroup label="International">
            <option value="en-US">English (US)</option>
            <option value="es-ES">Español (Spanish)</option>
            <option value="fr-FR">Français (French)</option>
            <option value="ar-SA">العربية (Arabic)</option>
            <option value="zh-CN">中文 (Mandarin)</option>
            <option value="ja-JP">日本語 (Japanese)</option>
            {availableLanguages.filter(l => !['hi-IN', 'en-IN', 'bn-IN', 'mr-IN', 'te-IN', 'ta-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'en-US', 'es-ES', 'fr-FR', 'ar-SA', 'zh-CN', 'ja-JP'].includes(l.code)).map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </optgroup>
        </select>

        <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
          <input 
            type="text"
            placeholder="Enter Location/Area"
            value={patientLocation}
            onChange={(e) => setPatientLocation(e.target.value)}
            disabled={step === 'vitals'}
            style={{ width: '100%', padding: '0.8rem', paddingRight: '2.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid var(--glass-border)', outline: 'none' }}
          />
          <button
            onClick={fetchLiveLocation}
            disabled={step === 'vitals' || isLocating}
            style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: isLocating ? '#a1a1aa' : '#60a5fa', cursor: 'pointer', padding: '0.2rem' }}
            title="Get Live Location"
          >
            {isLocating ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
          </button>
        </div>
      </div>

      {step === 'symptoms' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {/* Box 1: Document Scanner */}
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ margin: '0', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <FileText size={16}/> Hold-to-Scan Old Reports
              </h4>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 0.5rem 0' }}>Upload a messy prescription or past report. AI will read it automatically.</p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  id="report-upload"
                  style={{ display: 'none' }}
                  onChange={handleReportUpload}
                />
                <label 
                  htmlFor="report-upload" 
                  style={{ background: '#3b82f6', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}
                >
                  {isScanningReport ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                  {isScanningReport ? 'Scanning...' : 'Upload'}
                </label>

                {pastMedicalHistory && (
                  <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.3rem 0.6rem', borderRadius: '4px' }}>
                    <CheckCircle size={14} /> OCR Extracted!
                  </div>
                )}
              </div>
            </div>

            {/* Box 2: Computer Vision Triage */}
            <div style={{ background: 'rgba(139, 92, 246, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px dashed rgba(139, 92, 246, 0.3)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h4 style={{ margin: '0', color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <Camera size={16}/> Computer Vision Scan
              </h4>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: '0 0 0.5rem 0' }}>Agent 7: Upload photo of rash, wound, or symptom for visual AI diagnosis.</p>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment"
                  id="vision-upload"
                  style={{ display: 'none' }}
                  onChange={handleVisionUpload}
                />
                <label 
                  htmlFor="vision-upload" 
                  style={{ background: '#8b5cf6', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'bold', fontSize: '0.85rem' }}
                >
                  {isScanningVision ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />}
                  {isScanningVision ? 'Vision AI Analyzing...' : 'Scan Symptom'}
                </label>

                {visualFindings && (
                  <div style={{ color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', background: 'rgba(139, 92, 246, 0.2)', padding: '0.3rem 0.6rem', borderRadius: '4px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={visualFindings}>
                    <CheckCircle size={14} style={{flexShrink: 0}} /> Visual Added
                  </div>
                )}
              </div>
            </div>
          </div>
            
          {errorMsg && errorMsg.includes('Vision') && (
            <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem' }}>{errorMsg}</p>
          )}
        </>
      )}

      {step === 'symptoms' ? (
        <>
          <div className="section-header">
            <h2>Sanjeevani Kiosk</h2>
            <p>AI Triage Assistant</p>
          </div>

          <div className="kiosk-content">
            <button 
              className={`mic-button ${isListening ? 'listening' : ''}`}
              onClick={toggleListening}
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 size={48} className="animate-spin" /> : 
               isListening ? <Mic size={48} /> : <MicOff size={48} />}
            </button>

            <div className="status-text">
              {isProcessing ? "Analyzing Symptoms..." :
               isListening ? "Listening... Tap mic again to stop" : 
               "Tap the microphone and describe your problem"}
            </div>

            {errorMsg && (
              <div className="error-message" style={{color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: '8px', width: '100%', maxWidth: '500px', fontSize: '0.9rem', lineHeight: '1.4'}}>
                <AlertCircle size={24} style={{flexShrink: 0}} /> 
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="glass-panel transcript-box">
              {transcript} <span style={{opacity: 0.7}}>{interimTranscript}</span>
            </div>

            {!isListening && transcript.trim().length > 0 && !isProcessing && (
               <button 
                 onClick={handleSubmit}
                 style={{ marginTop: '1rem', padding: '0.8rem 2rem', background: 'linear-gradient(90deg, #8b5cf6, #3b82f6)', color: 'white', border: 'none', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)', transition: 'all 0.3s ease' }}
               >
                 <Send size={18} /> Analyze Symptoms
               </button>
            )}

            {showTextFallback && !isProcessing && (
              <div className="text-fallback-area" style={{width: '100%', maxWidth: '500px', display: 'flex', gap: '0.5rem', marginTop: '1rem'}}>
                <input 
                  type="text" 
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Or type your symptoms here..."
                  style={{flex: 1, padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', outline: 'none'}}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
                <button 
                  onClick={handleSubmit}
                  style={{padding: '0 1rem', background: 'var(--primary)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center'}}
                >
                  <Send size={18} />
                </button>
              </div>
            )}
          </div>
        </>
      ) : step === 'followup' ? (
        <>
          <div className="section-header">
            <h2>AI Doctor Evaluation</h2>
            <p>Please answer the follow-up question.</p>
          </div>
          
          <div className="kiosk-content" style={{ alignItems: 'stretch' }}>
            <div className="chat-history" style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', minHeight: '150px', maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {chatHistory.map((msg, idx) => (
                <div key={idx} style={{ 
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  background: msg.role === 'user' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(139, 92, 246, 0.2)',
                  border: msg.role === 'user' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(139, 92, 246, 0.3)',
                  padding: '0.8rem 1rem',
                  borderRadius: '12px',
                  maxWidth: '80%',
                  color: '#fff'
                }}>
                  <strong style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: msg.role === 'user' ? '#93c5fd' : '#c4b5fd', marginBottom: '0.5rem' }}>
                    <span>{msg.role === 'user' ? 'You' : 'AI Doctor'}</span>
                    {msg.role === 'ai' && (
                      <button 
                        onClick={() => speakText(msg.content)} 
                        style={{ background: 'none', border: 'none', color: '#c4b5fd', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center' }}
                        title="Repeat Audio"
                      >
                        <Volume2 size={14} />
                      </button>
                    )}
                  </strong>
                  {msg.content}
                </div>
              ))}
              {isProcessing && (
                <div style={{ alignSelf: 'flex-start', color: '#a1a1aa', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem' }}>
                  <Loader2 size={16} className="animate-spin" /> <em>Analyzing responses...</em>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <button 
                className={`mic-button ${isListening ? 'listening' : ''}`}
                onClick={toggleListening}
                disabled={isProcessing}
                style={{ width: '60px', height: '60px', marginBottom: '1rem' }}
              >
                {isProcessing ? <Loader2 size={24} className="animate-spin" /> : 
                 isListening ? <Mic size={24} /> : <MicOff size={24} />}
              </button>

              <div className="glass-panel transcript-box" style={{ width: '100%' }}>
                {transcript} <span style={{opacity: 0.7}}>{interimTranscript}</span>
              </div>

              <div className="text-fallback-area" style={{width: '100%', display: 'flex', gap: '0.5rem', marginTop: '1rem'}}>
                <input 
                  type="text" 
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Type your answer here..."
                  disabled={isProcessing}
                  style={{flex: 1, padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'white', outline: 'none'}}
                  onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                />
                <button 
                  onClick={handleSubmit}
                  disabled={isProcessing}
                  style={{padding: '0 1.5rem', background: 'var(--primary)', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'}}
                >
                  <Send size={18} /> Reply
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <TouchlessVitals onComplete={handleVitalsComplete} />
      )}
    </div>
  );
};

export default PatientKiosk;
