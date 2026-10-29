import { useCallback, useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import {
  Camera,
  Activity,
  AlertTriangle,
  CheckCircle,
  ShieldAlert,
  ScanFace,
  Mic,
  MicOff,
  Pause,
  Play,
  Save,
  Download,
  Copy,
  Loader2,
  EyeOff,
  Eye,
  Gauge,
  ClipboardList,
  Info,
} from 'lucide-react';
import { saveReportToDB } from '../services/ReportService';
import { showAlert } from '../services/AlertService';
import {
  LM,
  computeRawMetrics,
  createBaseline,
  DEFAULT_BASELINE,
  scoreFrame,
  scoreVocal,
  combineChannels,
  ema,
  severityBand,
  summarizeSession,
  buildEhrPayload,
  downloadSessionPDF,
  formatDuration,
} from '../services/PainAssessmentEngine';

const CALIBRATION_MS = 3200;
const FRAME_MS = 100;           // analyse ~10 fps
const UI_MS = 200;              // repaint UI ~5 fps
const SAMPLE_MS = 1000;         // one stored sample per second
const HISTORY_MAX = 120;

const OVERLAY_POINTS = [
  LM.browLInner, LM.browRInner, LM.browLOuter, LM.browROuter,
  LM.eyeLo, LM.eyeLi, LM.eyeLu, LM.eyeLd,
  LM.eyeRo, LM.eyeRi, LM.eyeRu, LM.eyeRd,
  LM.noseTip, LM.mouthL, LM.mouthR, LM.upperLipIn, LM.lowerLipIn, LM.upperLipOut,
];

const PainTracker = () => {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const modelRef = useRef(null);

  const trackingRef = useRef(false);
  const phaseRef = useRef('idle');
  const baselineRef = useRef({ ...DEFAULT_BASELINE });
  const calibrationRef = useRef(null);
  const samplesRef = useRef([]);
  const emaRef = useRef(null);
  const noiseFloorRef = useRef(0.02);
  const lastFrameRef = useRef(0);
  const lastUiRef = useRef(0);
  const lastSampleRef = useRef(0);
  const prevNoseRef = useRef(null);
  const historyRef = useRef([]);
  const clinicianNoteRef = useRef('');

  const [model, setModel] = useState(null);
  const [modelStatus, setModelStatus] = useState('Loading face-mesh model…');
  const [modelError, setModelError] = useState('');
  const [phase, setPhase] = useState('idle');
  const [calibrationPct, setCalibrationPct] = useState(0);
  const [live, setLive] = useState({ pain: 0, facial: 0, vocal: 0, quality: 0, expression: '—', nrs: 0 });
  const [au, setAu] = useState({ brow: 0, eye: 0, jaw: 0, mouth: 0, lip: 0, cheek: 0 });
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [manualMode, setManualMode] = useState(false);
  const [manualNrs, setManualNrs] = useState(4);
  const [patientId, setPatientId] = useState('');
  const [clinicianNote, setClinicianNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Refs mirror visual toggles so the long-lived animation loop never reads stale state.
  const privacyRef = useRef(false);
  const overlayOnRef = useRef(true);
  const frameBusyRef = useRef(false);
  const highPainAtRef = useRef(0);

  useEffect(() => {
    clinicianNoteRef.current = clinicianNote;
  }, [clinicianNote]);

  useEffect(() => {
    privacyRef.current = privacyMode;
  }, [privacyMode]);

  useEffect(() => {
    overlayOnRef.current = showOverlay;
  }, [showOverlay]);

  /* --------------------------- model loader -------------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await tf.ready();
        try {
          await tf.setBackend('webgl');
        } catch {
          await tf.setBackend('cpu');
        }
        const detector = await faceLandmarksDetection.createDetector(
          faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
          { runtime: 'tfjs', maxFaces: 1, refineLandmarks: false }
        );
        if (cancelled) return;
        modelRef.current = detector;
        setModel(detector);
        setModelStatus('Face-mesh ready');
      } catch (err) {
        console.error('Face model failed to load', err);
        if (!cancelled) {
          setModelError(`Face model could not load: ${err.message}`);
          setModelStatus('Face model unavailable');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* --------------------------- audio helpers ------------------------- */

  const setupAudio = (stream) => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    noiseFloorRef.current = 0.02;
    return true;
  };

  const readAudio = () => {
    const analyser = analyserRef.current;
    if (!analyser) return { rms: 0, hfRatio: 0, zcr: 0, present: false };
    const time = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(time);
    let sumSq = 0;
    let crossings = 0;
    for (let i = 0; i < time.length; i += 1) {
      const v = (time[i] - 128) / 128;
      sumSq += v * v;
      if (i > 0 && ((time[i] - 128) * (time[i - 1] - 128)) < 0) crossings += 1;
    }
    const rms = Math.sqrt(sumSq / time.length);
    const zcr = crossings / time.length;

    const freq = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freq);
    let total = 0;
    let high = 0;
    for (let i = 0; i < freq.length; i += 1) {
      total += freq[i];
      if (i > freq.length * 0.6) high += freq[i];
    }
    const hfRatio = total > 0 ? high / total : 0;

    // Adaptive noise floor: track the quietest recent window.
    if (rms < noiseFloorRef.current) noiseFloorRef.current = rms;
    else noiseFloorRef.current += (rms - noiseFloorRef.current) * 0.0008;

    return { rms, hfRatio, zcr, present: true };
  };

  /* --------------------------- overlay drawing ----------------------- */

  const drawOverlay = (faces, video) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!overlayOnRef.current || privacyRef.current) return;

    if (!faces || !faces.length) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.9)';
      ctx.font = '16px monospace';
      ctx.fillText('Searching for a face…', 20, 34);
      return;
    }

    const face = faces[0];
    const kp = face.keypoints;
    ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
    OVERLAY_POINTS.forEach((idx) => {
      const p = kp[idx];
      if (!p) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    });

    const box = face.box;
    if (box) {
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(box.xMin, box.yMin, box.width, box.height);
    }
  };

  /* ----------------------------- main loop --------------------------- */

  const notifyHighPain = () => {
    const now = Date.now();
    if (now - highPainAtRef.current < 60000) return;
    highPainAtRef.current = now;
    showAlert('Sustained high pain pattern detected (≥70/100). Consider clinical review and a validated pain scale.', 'error');
  };

  const loop = useCallback(async function frame() {
    if (!trackingRef.current) return;
    rafRef.current = requestAnimationFrame(frame);

    const now = performance.now();
    if (now - lastFrameRef.current < FRAME_MS) return;
    lastFrameRef.current = now;
    if (frameBusyRef.current) return;

    const video = videoRef.current;
    const detector = modelRef.current;
    if (!video || !detector || video.videoWidth === 0) return;

    frameBusyRef.current = true;
    try {
      const faces = await detector.estimateFaces(video, { flipHorizontal: false });
      drawOverlay(faces, video);

      const keypoints = faces?.[0]?.keypoints;
      const raw = computeRawMetrics(keypoints);
      const box = faces?.[0]?.box;

      // Signal quality from box coverage + head stability.
      let quality = 0;
      if (raw && box) {
        const frameArea = (video.videoWidth || 640) * (video.videoHeight || 480);
        const coverage = Math.min(1, (box.width * box.height) / frameArea);
        let stability = 1;
        if (prevNoseRef.current && keypoints?.[LM.noseTip]) {
          const nose = keypoints[LM.noseTip];
          const move = Math.hypot(nose.x - prevNoseRef.current.x, nose.y - prevNoseRef.current.y);
          stability = Math.max(0, 1 - move / (raw.faceWidth * 0.25));
        }
        if (keypoints?.[LM.noseTip]) prevNoseRef.current = { ...keypoints[LM.noseTip] };
        quality = Math.round(Math.min(100, coverage * 260) * 0.65 + stability * 100 * 0.35);
      } else {
        prevNoseRef.current = null;
      }

      const audio = readAudio();
      const vocal = audio.present
        ? scoreVocal({ rms: audio.rms, hfRatio: audio.hfRatio, zcr: audio.zcr }, noiseFloorRef.current)
        : 0;

      // ---- calibration ----
      if (phaseRef.current === 'calibrating' && calibrationRef.current) {
        if (raw) calibrationRef.current.samples.push(raw);
        const elapsed = now - calibrationRef.current.startedAt;
        const pct = Math.min(100, Math.round((elapsed / CALIBRATION_MS) * 100));
        if (now - lastUiRef.current > UI_MS) {
          lastUiRef.current = now;
          setCalibrationPct(pct);
        }
        if (elapsed >= CALIBRATION_MS) {
          baselineRef.current = createBaseline(calibrationRef.current.samples);
          calibrationRef.current = null;
          phaseRef.current = 'monitoring';
          setPhase('monitoring');
          setCalibrationPct(100);
        }
        return;
      }

      // ---- monitoring ----
      if (phaseRef.current !== 'monitoring') return;

      const scored = scoreFrame(raw, baselineRef.current, quality);
      const fused = combineChannels({
        facialScore: scored.facialScore,
        vocalScore: vocal,
        quality,
        hasAudio: Boolean(analyserRef.current),
      });
      emaRef.current = ema(emaRef.current ?? fused, fused, 0.22);
      const smoothed = Math.round(emaRef.current);

      if (now - lastUiRef.current > UI_MS) {
        lastUiRef.current = now;
        setLive({
          pain: smoothed,
          facial: Math.round(scored.facialScore),
          vocal: Math.round(vocal),
          quality: scored.quality,
          expression: scored.expression,
          nrs: Math.round((smoothed / 10) * 10) / 10,
        });
        setAu(scored.au);
      }

      if (now - lastSampleRef.current >= SAMPLE_MS) {
        lastSampleRef.current = now;
        samplesRef.current.push({
          t: Date.now(),
          pain: smoothed,
          facial: Math.round(scored.facialScore),
          vocal: Math.round(vocal),
          quality: scored.quality,
          expression: scored.expression,
        });
        historyRef.current = [...historyRef.current, { t: Date.now(), pain: smoothed }].slice(-HISTORY_MAX);
        setHistory(historyRef.current);
        if (samplesRef.current.length > 7200) samplesRef.current.shift(); // 2 h cap
        if (smoothed >= 70) notifyHighPain();
      }
    } catch (err) {
      console.error('Tracking frame failed', err);
    } finally {
      frameBusyRef.current = false;
    }
  }, []);

  /* ---------------------------- start/stop --------------------------- */

  const cleanupMedia = () => {
    trackingRef.current = false;
    phaseRef.current = 'idle';
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const startSession = async () => {
    setError('');
    setSummary(null);
    setHistory([]);
    historyRef.current = [];
    samplesRef.current = [];
    emaRef.current = null;
    prevNoseRef.current = null;
    highPainAtRef.current = 0;

    if (!modelRef.current) {
      setError(modelError || 'Face model is still loading. Please wait a moment.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: micEnabled,
      });
      streamRef.current = stream;
      if (micEnabled) setupAudio(stream);

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      trackingRef.current = true;
      phaseRef.current = 'calibrating';
      setPhase('calibrating');
      setCalibrationPct(0);
      lastFrameRef.current = 0;
      lastUiRef.current = 0;
      lastSampleRef.current = 0;
      calibrationRef.current = {
        samples: [],
        startedAt: performance.now(),
      };
      showAlert('Look at the camera and hold a neutral expression for 3 seconds.', 'info');
      loop();
    } catch (err) {
      console.error('getUserMedia failed', err);
      cleanupMedia();
      setPhase('idle');
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera/microphone permission was denied. Use the manual assessment option below.'
          : `Could not start the camera: ${err.message}`
      );
    }
  };

  const stopSession = () => {
    const wasMonitoring = phaseRef.current === 'monitoring' || phaseRef.current === 'calibrating';
    cleanupMedia();
    setPhase('idle');
    setCalibrationPct(0);
    setLive({ pain: 0, facial: 0, vocal: 0, quality: 0, expression: '—', nrs: 0 });
    setAu({ brow: 0, eye: 0, jaw: 0, mouth: 0, lip: 0, cheek: 0 });
    if (wasMonitoring && samplesRef.current.length > 2) {
      const result = summarizeSession(samplesRef.current, {
        mode: 'camera',
        audioEnabled: micEnabled,
        calibrated: baselineRef.current.calibrated,
        note: clinicianNoteRef.current,
      });
      setSummary(result);
      showAlert('Session ended. Review the summary below.', 'success');
    } else if (wasMonitoring) {
      showAlert('Session was too short to summarise. Track for at least a few seconds.', 'info');
    }
  };

  useEffect(() => () => cleanupMedia(), []);

  /* --------------------------- manual mode --------------------------- */

  const finishManualAssessment = () => {
    const nrs = Number(manualNrs);
    const now = Date.now();
    const samples = [
      { t: now - 60000, pain: Math.max(0, Math.round(nrs * 10) - 8), facial: 0, vocal: 0, quality: 100, expression: 'SELF-REPORT' },
      { t: now, pain: Math.round(nrs * 10), facial: 0, vocal: 0, quality: 100, expression: 'SELF-REPORT' },
    ];
    const result = summarizeSession(samples, {
      mode: 'manual',
      audioEnabled: false,
      calibrated: false,
      note: clinicianNoteRef.current,
    });
    result.manualNrs = nrs;
    setSummary(result);
    showAlert('Manual self-report recorded.', 'success');
  };

  /* ------------------------------ export ----------------------------- */

  const requirePatientId = () => {
    if (!patientId.trim()) {
      showAlert('Patient ID is mandatory to save the session.', 'error');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!summary) return;
    if (!requirePatientId()) return;
    setIsSaving(true);
    try {
      const payload = buildEhrPayload(summary, patientId.trim());
      payload.data.clinicianNote = clinicianNote;
      await saveReportToDB('PainTracker', patientId.trim(), payload.data);
      showAlert('Pain screening session saved to the patient record.', 'success');
    } catch (err) {
      showAlert('Failed to save session: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePdf = () => {
    if (!summary) return;
    downloadSessionPDF(summary, patientId.trim() || 'Anonymous', clinicianNote);
  };

  const summaryText = () => {
    if (!summary) return '';
    return [
      `Pain screening session — ${new Date(summary.startedAt).toLocaleString()}`,
      `Mode: ${summary.mode === 'camera' ? 'camera + microphone' : 'manual self-report'}`,
      `Duration: ${formatDuration(summary.durationSec)} | Samples: ${summary.sampleCount}`,
      `Mean pain index: ${summary.meanPain}/100 (NRS ≈ ${summary.nrsMean}/10)`,
      `Peak: ${summary.peakPain}/100 (NRS ≈ ${summary.nrsPeak}/10) | p90: ${summary.p90Pain}/100`,
      `Time ≥ moderate: ${summary.secondsAbove4}s | Time ≥ severe: ${summary.secondsAbove7}s`,
      `Dominant expression: ${summary.dominantExpression}`,
      `Signal quality: ${summary.avgQuality}/100 | Trend: ${summary.trendLabel} (${summary.trendPerMinute}/min)`,
      `Classification: ${summary.bandLabel}`,
      summary.note ? `Clinician note: ${summary.note}` : '',
      'Screening aid only — not a diagnosis.',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const handleCopy = async () => {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summaryText());
      showAlert('Session summary copied.', 'success');
    } catch {
      showAlert('Clipboard blocked by the browser.', 'error');
    }
  };

  /* ------------------------------- view ------------------------------ */

  const idleReady = phase === 'idle';
  const band = idleReady
    ? { nrs: 0, label: 'Ready to screen', band: 'none', color: '#00e5ff', advice: 'Start a session to begin measuring. A 3-second neutral calibration runs first.' }
    : severityBand(live.pain);
  const highPain = phase === 'monitoring' && live.pain >= 70;
  const calibrating = phase === 'calibrating';
  const summaryBand = summary ? severityBand(summary.meanPain) : null;

  const sparkline = (() => {
    if (history.length < 2) return null;
    const w = 100;
    const h = 30;
    const points = history
      .map((p, i) => `${(i / (history.length - 1)) * w},${h - (p.pain / 100) * h}`)
      .join(' ');
    return (
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: '64px', display: 'block' }} role="img" aria-label="Pain index trend over the session">
        <line x1="0" y1={h * 0.7} x2={w} y2={h * 0.7} stroke="rgba(251,191,36,0.35)" strokeWidth="0.4" />
        <line x1="0" y1={h * 0.3} x2={w} y2={h * 0.3} stroke="rgba(248,113,113,0.35)" strokeWidth="0.4" />
        <polyline points={points} fill="none" stroke="#00e5ff" strokeWidth="1" />
      </svg>
    );
  })();

  return (
    <div className="module-container" style={{ display: 'flex', gap: '2rem', alignItems: 'stretch' }}>
      <style>{`
        @keyframes pt-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pt-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>

      {/* Left: camera */}
      <div className="glass-panel" style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', padding: '1rem', minWidth: 0 }}>
        <div className="section-header" style={{ margin: '0 0 0.9rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Camera size={20} /> Live pain screening
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setPrivacyMode((v) => !v)}
              aria-pressed={privacyMode}
              title="Hide the video preview. Analysis continues."
              style={chipBtn(privacyMode)}
            >
              {privacyMode ? <EyeOff size={14} /> : <Eye size={14} />} {privacyMode ? 'Preview hidden' : 'Privacy'}
            </button>
            <button
              type="button"
              onClick={() => setShowOverlay((v) => !v)}
              aria-pressed={showOverlay}
              title="Toggle landmark overlay"
              style={chipBtn(!showOverlay)}
            >
              <ScanFace size={14} /> Landmarks
            </button>
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', background: 'var(--bg-dark)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--glass-border)', minHeight: '340px' }}>
          <video
            ref={videoRef}
            width="640"
            height="480"
            playsInline
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', filter: privacyMode ? 'blur(18px) brightness(0.4)' : 'contrast(1.05) brightness(1.05)' }}
          />
          <canvas
            ref={overlayRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', pointerEvents: 'none' }}
          />

          {phase === 'idle' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', background: 'rgba(5,5,10,0.72)', backdropFilter: 'blur(6px)', padding: '1.5rem' }}>
              <ScanFace size={54} style={{ opacity: 0.85, marginBottom: '0.75rem', color: 'var(--primary)' }} />
              <p style={{ margin: '0 0 0.35rem', color: '#e2e8f0', fontWeight: 600 }}>{modelStatus}</p>
              <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: '420px', lineHeight: 1.5 }}>
                3-second neutral calibration, then continuous facial + vocal screening. Nothing is recorded or uploaded — every frame is processed in this browser tab.
              </p>
              {modelError ? (
                <p style={{ color: 'var(--status-red)', fontSize: '0.82rem', margin: '0 0 1rem' }}>{modelError}</p>
              ) : null}
              <button
                type="button"
                onClick={startSession}
                disabled={!model}
                style={{
                  padding: '0.9rem 1.6rem',
                  background: model ? 'var(--primary)' : 'rgba(255,255,255,0.12)',
                  border: 'none',
                  borderRadius: '8px',
                  color: model ? '#000' : '#9ca3af',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: model ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: model ? '0 0 20px rgba(0, 229, 255, 0.4)' : 'none',
                }}
              >
                <Play size={18} /> Start screening
              </button>
            </div>
          )}

          {calibrating && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,5,10,0.6)', padding: '1.5rem' }}>
              <Gauge size={44} color="#00e5ff" style={{ marginBottom: '0.75rem' }} />
              <p style={{ margin: '0 0 0.6rem', color: '#fff', fontWeight: 600 }}>Calibrating neutral face…</p>
              <div style={{ width: 'min(320px, 80%)', height: '8px', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${calibrationPct}%`, height: '100%', background: '#00e5ff', transition: 'width 0.2s linear' }} />
              </div>
              <p style={{ margin: '0.6rem 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{calibrationPct}%</p>
            </div>
          )}

          {highPain && (
            <div role="alert" aria-live="assertive" style={{ position: 'absolute', top: '12px', left: '12px', right: '12px', background: 'rgba(248,113,113,0.92)', color: '#1a0505', borderRadius: '8px', padding: '0.55rem 0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', animation: 'pt-pulse 1.6s infinite' }}>
              <AlertTriangle size={18} /> High pain pattern — clinical review recommended
            </div>
          )}

          {phase === 'monitoring' && (
            <div style={{ position: 'absolute', bottom: '12px', left: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(5,5,10,0.75)', border: '1px solid rgba(0,229,255,0.25)', borderRadius: '20px', padding: '0.35rem 0.8rem', fontFamily: 'monospace', fontSize: '0.78rem', color: '#00e5ff' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: live.quality > 35 ? '#34d399' : '#f87171' }} />
              SIGNAL {live.quality}%
            </div>
          )}
        </div>

        {/* Media controls */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.9rem' }}>
          {phase === 'idle' ? (
            <button type="button" onClick={startSession} disabled={!model} style={primaryBtn(!!model)}>
              <Play size={16} /> {model ? 'Start screening' : 'Model loading…'}
            </button>
          ) : (
            <button type="button" onClick={stopSession} style={{ ...primaryBtn(true), background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid #f87171' }}>
              <Pause size={16} /> End session & summarise
            </button>
          )}

          <button type="button" onClick={() => setMicEnabled((v) => !v)} disabled={phase !== 'idle'} aria-pressed={micEnabled} style={chipBtn(false)}>
            {micEnabled ? <Mic size={14} /> : <MicOff size={14} />} {micEnabled ? 'Mic on' : 'Mic off'}
          </button>

          <button type="button" onClick={() => setManualMode((v) => !v)} aria-pressed={manualMode} style={chipBtn(manualMode)}>
            <ClipboardList size={14} /> Manual self-report
          </button>

          {!model && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Loader2 size={14} style={{ animation: 'pt-spin 1s linear infinite' }} /> {modelStatus}</span>}
        </div>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Mic/audio is optional and can be switched off before starting. Face frames never leave the browser; nothing is uploaded.
        </p>

        {manualMode && (
          <div style={{ marginTop: '0.9rem', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1rem' }}>
            <h4 style={{ margin: '0 0 0.6rem', color: 'var(--primary)', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ClipboardList size={16} /> Manual pain self-report (0–10)
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input type="range" min="0" max="10" step="1" value={manualNrs} onChange={(e) => setManualNrs(Number(e.target.value))} aria-label="Pain score 0 to 10" style={{ flex: 1, accentColor: '#00e5ff' }} />
              <span style={{ fontFamily: 'monospace', fontSize: '1.3rem', color: '#00e5ff', minWidth: '2.5rem', textAlign: 'right' }}>{manualNrs}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              <span>0 · none</span><span>4 · moderate</span><span>10 · worst imaginable</span>
            </div>
            <button type="button" onClick={finishManualAssessment} style={{ ...primaryBtn(true), marginTop: '0.75rem', width: '100%', justifyContent: 'center' }}>
              <CheckCircle size={16} /> Record manual assessment
            </button>
          </div>
        )}
      </div>

      {/* Right: live metrics + summary */}
      <div className="glass-panel custom-scrollbar" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minWidth: 0 }}>
        <div className="section-header" style={{ position: 'sticky', top: 0, background: 'var(--bg-panel)', paddingBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)', zIndex: 10 }}>
          <h2 style={{ fontSize: '1.15rem' }}>Pain screening panel</h2>
          <p>Facial action-unit proxies + vocal distress, calibrated per patient</p>
        </div>

        {error && (
          <div role="alert" style={{ marginTop: '0.75rem', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: '10px', padding: '0.75rem', color: '#fecaca', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {/* Live number */}
        <div style={{ marginTop: '0.9rem', background: 'var(--bg-elevated)', border: `1px solid ${band.color}66`, borderRadius: '12px', padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', letterSpacing: '0.09em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pain index</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                <span style={{ fontSize: '2.6rem', fontWeight: 800, color: band.color, lineHeight: 1.05 }}>{live.pain}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>/100</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>≈ NRS {live.nrs}/10</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: band.color, fontWeight: 700, fontSize: '0.85rem' }}>
                {band.band === 'severe' ? <ShieldAlert size={16} /> : band.band === 'none' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                {band.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{live.expression}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>quality {live.quality}%</div>
            </div>
          </div>

          <div style={{ marginTop: '0.8rem', height: '10px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style={{ width: `${live.pain}%`, height: '100%', background: band.color, transition: 'width 0.25s ease-out' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.7rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            <span>Facial channel <strong style={{ color: '#e2e8f0' }}>{live.facial}</strong></span>
            <span>Vocal channel <strong style={{ color: '#e2e8f0' }}>{live.vocal}</strong></span>
          </div>

          <p style={{ margin: '0.6rem 0 0', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{band.advice}</p>
        </div>

        {/* Trend */}
        <div style={{ marginTop: '0.75rem', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Activity size={15} /> Live trend
            </h4>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{history.length} samples</span>
          </div>
          <div style={{ marginTop: '0.4rem' }}>{sparkline || <div style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.78rem' }}>No samples yet</div>}</div>
        </div>

        {/* Action units */}
        <div style={{ marginTop: '0.75rem', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1rem' }}>
          <h4 style={{ margin: '0 0 0.7rem', fontSize: '0.85rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Activity size={15} /> Facial action-unit proxies
          </h4>
          {[
            ['Brow lowering (AU4)', au.brow, '#a855f7'],
            ['Eye squeeze (AU7)', au.eye, '#3b82f6'],
            ['Jaw drop (AU26)', au.jaw, '#f97316'],
            ['Mouth stretch (AU20)', au.mouth, '#eab308'],
            ['Upper lip raise (AU10)', au.lip, '#ec4899'],
            ['Cheek raise (AU6)', au.cheek, '#22c55e'],
          ].map(([label, value, colorHex]) => (
            <div key={label} style={{ marginBottom: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>
                <span>{label}</span>
                <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{value}</span>
              </div>
              <div style={{ height: '5px', background: 'var(--bg-dark)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${value}%`, height: '100%', background: colorHex, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
            Values are deviations from this patient&apos;s calibrated neutral baseline, not absolute clinical AU intensities.
          </p>
        </div>

        {/* Summary */}
        {summary && (
          <div style={{ marginTop: '0.75rem', background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.35)', borderRadius: '12px', padding: '1.1rem' }}>
            <h4 style={{ margin: '0 0 0.7rem', fontSize: '0.95rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ClipboardList size={17} /> Session summary
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem 1rem', fontSize: '0.8rem', color: '#e2e8f0' }}>
              <span>Duration: <strong>{summary.mode === 'manual' ? 'self-report' : formatDuration(summary.durationSec)}</strong></span>
              <span>Samples: <strong>{summary.sampleCount}</strong></span>
              <span>Mean: <strong>{summary.meanPain}/100</strong></span>
              <span>Peak: <strong>{summary.peakPain}/100</strong></span>
              <span>NRS mean: <strong>{summary.nrsMean}/10</strong></span>
              <span>NRS peak: <strong>{summary.nrsPeak}/10</strong></span>
              <span>≥ moderate: <strong>{summary.secondsAbove4}s</strong></span>
              <span>≥ severe: <strong>{summary.secondsAbove7}s</strong></span>
              <span>Dominant: <strong>{summary.dominantExpression}</strong></span>
              <span>Quality: <strong>{summary.avgQuality}/100</strong></span>
              <span>Trend: <strong>{summary.trendLabel}</strong></span>
              <span>Mode: <strong>{summary.mode}</strong></span>
            </div>
            <p style={{ margin: '0.6rem 0 0', fontSize: '0.78rem', color: summaryBand?.color || band.color, fontWeight: 600 }}>{summary.bandLabel}</p>
            {!summary.calibrated && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: 'var(--status-yellow)' }}>
                Calibration did not complete — scores used default baseline and are less personalised.
              </p>
            )}

            <label htmlFor="pt-patient" style={{ display: 'block', marginTop: '0.8rem', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Patient ID (mandatory to save) *
            </label>
            <input id="pt-patient" type="text" value={patientId} onChange={(e) => setPatientId(e.target.value)} placeholder="e.g. PAT-90812" style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: '#fff' }} />
            <textarea value={clinicianNote} onChange={(e) => setClinicianNote(e.target.value)} rows={2} placeholder="Clinician note (optional)" style={{ width: '100%', marginTop: '0.5rem', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: '#fff', resize: 'vertical', fontFamily: 'inherit' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.6rem' }}>
              <button type="button" onClick={handleSave} disabled={isSaving} style={smallBtn('#00e5ff', '#000')}>
                {isSaving ? <Loader2 size={14} style={{ animation: 'pt-spin 1s linear infinite' }} /> : <Save size={14} />} Save
              </button>
              <button type="button" onClick={handlePdf} style={smallBtn('transparent', '#fff', true)}>
                <Download size={14} /> PDF
              </button>
              <button type="button" onClick={handleCopy} style={smallBtn('transparent', '#fff', true)}>
                <Copy size={14} /> Copy
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.75rem' }}>
          <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '0.1rem' }} />
          <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Designed for patients who cannot reliably self-report pain (post-operative, ICU, dementia, paediatric, non-verbal).
            This is a screening aid: it does not diagnose, is not a validated clinical instrument, and must be confirmed with a
            validated pain scale and clinical judgement.
          </p>
        </div>
      </div>
    </div>
  );
};

const chipBtn = (active) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  padding: '0.35rem 0.6rem',
  borderRadius: '20px',
  border: active ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
  background: active ? 'rgba(0,229,255,0.1)' : 'transparent',
  color: active ? 'var(--primary)' : '#cbd5e1',
  fontSize: '0.75rem',
  cursor: 'pointer',
});

const primaryBtn = (enabled) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
  padding: '0.7rem 1.1rem',
  borderRadius: '8px',
  border: 'none',
  background: enabled ? 'var(--primary)' : 'rgba(255,255,255,0.12)',
  color: enabled ? '#000' : '#9ca3af',
  fontWeight: 'bold',
  cursor: enabled ? 'pointer' : 'not-allowed',
  fontSize: '0.88rem',
});

const smallBtn = (bg, color, outline = false) => ({
  padding: '0.5rem',
  borderRadius: '7px',
  border: outline ? '1px solid var(--glass-border)' : 'none',
  background: bg,
  color,
  fontWeight: 'bold',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.3rem',
  fontSize: '0.78rem',
});

export default PainTracker;
