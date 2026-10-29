import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Palette,
  HeartHandshake,
  Loader2,
  Download,
  Sparkles,
  Brain,
  Heart,
  Save,
  Undo2,
  Trash2,
  ImagePlus,
  RefreshCw,
  ShieldCheck,
  Copy,
  PhoneCall,
  Brush,
  Eraser,
} from 'lucide-react';
import { analyzeArtTherapyEmotion } from '../services/AIEngine';
import { saveReportToDB, downloadPDF } from '../services/ReportService';
import { uploadToCloudinary } from '../services/CloudinaryService';
import { showAlert } from '../services/AlertService';
import {
  PAPER_COLOR,
  MOOD_SCALE,
  ENERGY_SCALE,
  CRISIS_LINES,
  GUIDED_PROMPTS,
  getRandomPrompt,
  analyzeImageElement,
  mapAffect,
  colorHarmony,
  localReflection,
  buildAiContext,
  isAiFallback,
  buildSessionSummary,
  artworkThumbnail,
  artworkDataUrl,
  downloadDataUrl,
} from '../services/ArtTherapyEngine';

const CANVAS_W = 1000;
const CANVAS_H = 700;

const SWATCHES = [
  '#1f2937', '#dc2626', '#ea580c', '#f59e0b', '#eab308', '#84cc16',
  '#16a34a', '#0d9488', '#06b6d4', '#2563eb', '#4f46e5', '#7c3aed',
  '#c026d3', '#db2777', '#f472b6', '#a16207', '#f5f5f4', '#78716c',
];

const ArtTherapy = () => {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const drawingRef = useRef({ active: false, lastX: 0, lastY: 0 });
  const undoStackRef = useRef([]);

  // ---- session inputs ----
  const [guidedPrompt, setGuidedPrompt] = useState(() => getRandomPrompt(null));
  const [note, setNote] = useState('');
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [color, setColor] = useState('#7c3aed');
  const [brushSize, setBrushSize] = useState(10);
  const [tool, setTool] = useState('brush'); // brush | eraser
  const [mode, setMode] = useState('draw'); // draw | upload
  const [useAi, setUseAi] = useState(true);

  // ---- results ----
  const [analysis, setAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [sessions, setSessions] = useState([]);

  // ---- EHR actions ----
  const [patientId, setPatientId] = useState('');
  const [attachImage, setAttachImage] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const paintPaper = useCallback((canvas) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PAPER_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    paintPaper(canvas);
    undoStackRef.current = [];
  }, [paintPaper]);

  /* ----------------------------- drawing ----------------------------- */

  const pointerPos = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const stroke = (from, to) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = tool === 'eraser' ? PAPER_COLOR : color;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.restore();
  };

  const handlePointerDown = (event) => {
    if (!canvasRef.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const pos = pointerPos(event);
    drawingRef.current = { active: true, lastX: pos.x, lastY: pos.y };
    stroke(pos, pos);
  };

  const handlePointerMove = (event) => {
    if (!drawingRef.current.active) return;
    const pos = pointerPos(event);
    stroke({ x: drawingRef.current.lastX, y: drawingRef.current.lastY }, pos);
    drawingRef.current.lastX = pos.x;
    drawingRef.current.lastY = pos.y;
  };

  const finishStroke = () => {
    if (!drawingRef.current.active) return;
    drawingRef.current.active = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      undoStackRef.current.push(canvas.toDataURL('image/png'));
      if (undoStackRef.current.length > 12) undoStackRef.current.shift();
    } catch (err) {
      console.warn('Undo snapshot failed', err);
    }
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    undoStackRef.current.pop(); // current state
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previous) {
      paintPaper(canvas);
      return;
    }
    const img = new Image();
    img.onload = () => {
      paintPaper(canvas);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = previous;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    paintPaper(canvas);
    undoStackRef.current = [];
    setAnalysis(null);
    setErrorMsg('');
    setMode('draw');
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showAlert('Please choose an image file (JPG/PNG).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        paintPaper(canvas);
        const ctx = canvas.getContext('2d');
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        undoStackRef.current = [];
        setMode('upload');
        setAnalysis(null);
        setErrorMsg('');
        showAlert('Artwork loaded. Adjust the mood sliders, then run the analysis.', 'success');
      };
      img.onerror = () => showAlert('That image could not be decoded.', 'error');
      img.src = reader.result;
    };
    reader.onerror = () => showAlert('Could not read that file.', 'error');
    reader.readAsDataURL(file);
  };

  /* ---------------------------- analysis ---------------------------- */

  const runAnalysis = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setErrorMsg('');
    setAnalysis(null);
    setIsAnalyzing(true);
    try {
      const features = analyzeImageElement(canvas, { background: 'paper' });
      const selfReport = { mood, energy };
      const affect = mapAffect(features, selfReport);
      const harmony = colorHarmony(features.palette);
      const local = localReflection(features, affect, harmony, guidedPrompt.text);

      let insight = local.insight;
      let recommendation = local.recommendation;
      let source = 'local';

      if (useAi) {
        setAiBusy(true);
        try {
          const ai = await analyzeArtTherapyEmotion(
            buildAiContext({ features, affect, harmony, selfReport, note, prompt: guidedPrompt.text })
          );
          if (!isAiFallback(ai) && ai.insight) {
            insight = ai.insight;
            recommendation = ai.recommendation || recommendation;
            source = 'ai';
          }
        } catch (aiErr) {
          console.warn('AI narrative unavailable, using local analysis:', aiErr.message);
        } finally {
          setAiBusy(false);
        }
      }

      const session = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: new Date().toISOString(),
        prompt: guidedPrompt.text,
        promptTheme: guidedPrompt.theme,
        mood,
        energy,
        features,
        affect,
        harmony,
        insight,
        recommendation,
        source,
        thumbnail: artworkThumbnail(canvas, 160),
      };

      setAnalysis(session);
      setSessions((prev) => [session, ...prev].slice(0, 8));
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Analysis failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /* ----------------------------- actions ---------------------------- */

  const requirePatientId = () => {
    if (!patientId.trim()) {
      showAlert('Patient ID is mandatory to save this session to the record system.', 'error');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!analysis) return;
    if (!requirePatientId()) return;
    setIsSaving(true);
    try {
      let imageUrl = null;
      if (attachImage) {
        try {
          imageUrl = await uploadToCloudinary(artworkDataUrl(canvasRef.current), patientId.trim());
        } catch (uploadErr) {
          console.warn('Artwork upload skipped:', uploadErr.message);
          showAlert('Artwork image could not be uploaded (Cloudinary not configured). Session data will still be saved.', 'info');
        }
      }

      await saveReportToDB('ArtTherapy', patientId.trim(), {
        kind: 'art-therapy-session',
        at: analysis.at,
        guidedPrompt: analysis.prompt,
        promptTheme: analysis.promptTheme,
        patientWords: note,
        selfReport: { mood, energy, moodLabel: MOOD_SCALE[mood - 1], energyLabel: ENERGY_SCALE[energy - 1] },
        palette: analysis.features.palette,
        metrics: analysis.features,
        affect: analysis.affect,
        harmony: analysis.harmony,
        insight: analysis.insight,
        recommendation: analysis.recommendation,
        narrativeSource: analysis.source,
        imageUrl,
        disclaimer:
          'Expressive-art screening aid. Not a diagnosis; not a substitute for a licensed therapist or psychiatrist.',
      });
      showAlert('Art therapy session saved to the patient record.', 'success');
    } catch (err) {
      showAlert('Failed to save session: ' + err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!analysis) return;
    const metricsLine =
      `Measured: palette ${analysis.features.palette.map((p) => `${p.hex} ${p.share}%`).join(', ')}; ` +
      `colourfulness ${analysis.features.colorfulness}/100, brightness ${analysis.features.brightness}/100, ` +
      `warm ${analysis.features.warmRatio}% / cool ${analysis.features.coolRatio}%, ` +
      `detail ${analysis.features.detailBand}, coverage ${analysis.features.coverage}%, symmetry ${analysis.features.symmetry}/100. ` +
      `Affect estimate: valence ${analysis.affect.valence}/100, arousal ${analysis.affect.arousal}/100 (${analysis.affect.label}). ` +
      `Guided prompt: "${analysis.prompt}".`;
    downloadPDF('ArtTherapy', patientId.trim() || 'Anonymous', {
      insight: `${metricsLine}\n\n${analysis.insight}`,
      recommendation: analysis.recommendation,
      colorPalette: analysis.features.palette.map((p) => p.hex),
    });
  };

  const handleDownloadPng = () => {
    const url = artworkDataUrl(canvasRef.current);
    if (!url) return;
    downloadDataUrl(url, `Sanjeevani_Artwork_${patientId.trim() || 'Anonymous'}_${Date.now()}.png`);
  };

  const handleCopySummary = async () => {
    if (!analysis) return;
    const text = buildSessionSummary(analysis);
    try {
      await navigator.clipboard.writeText(text);
      showAlert('Session summary copied to clipboard.', 'success');
    } catch {
      showAlert('Clipboard access blocked by the browser.', 'error');
    }
  };

  const startNewSession = () => {
    clearCanvas();
    setGuidedPrompt(getRandomPrompt(guidedPrompt.id));
    setNote('');
    setMood(3);
    setEnergy(3);
    setTool('brush');
    setColor('#7c3aed');
    showAlert('New blank canvas ready.', 'info');
  };

  const shufflePrompt = () => {
    setGuidedPrompt(getRandomPrompt(guidedPrompt.id));
  };

  const showCrisis = analysis && (analysis.affect.valence < 35 || mood <= 2);

  /* ------------------------------ view ------------------------------ */

  const bar = (label, value, colorHex) => (
    <div key={label}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
        <span>{label}</span>
        <span style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: '6px', background: 'var(--bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: colorHex, borderRadius: '3px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );

  return (
    <div className="module-container" style={{ display: 'flex', gap: '2rem', alignItems: 'stretch' }}>
      <style>{`
        @keyframes at-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes at-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Left: inputs */}
      <div
        className="glass-panel custom-scrollbar"
        style={{ flex: '0 0 42%', display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: '0.5rem' }}
      >
        <div className="section-header" style={{ marginBottom: '1.25rem', position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 10, paddingBottom: '0.75rem', borderBottom: '1px solid var(--glass-border)' }}>
          <h2>Art Therapy Studio</h2>
          <p>Expressive drawing + measured colour/affect analysis</p>
        </div>

        {/* Guided prompt */}
        <div style={{ background: 'var(--bg-elevated)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <h3 style={{ color: 'var(--primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
              <HeartHandshake size={18} /> Guided prompt
            </h3>
            <button
              type="button"
              onClick={shufflePrompt}
              aria-label="Pick another guided prompt"
              style={{ background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '0.3rem 0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
            >
              <RefreshCw size={13} /> {GUIDED_PROMPTS.length} prompts
            </button>
          </div>
          <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.6, fontSize: '0.95rem' }}>
            <span style={{ color: '#c084fc', fontWeight: 600 }}>[{guidedPrompt.theme}] </span>
            {guidedPrompt.text}
          </p>
        </div>

        {/* Self-report */}
        <div style={{ background: 'var(--bg-elevated)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--glass-border)', marginTop: '1rem' }}>
          <h3 style={{ color: '#f472b6', margin: '0 0 0.9rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
            <Heart size={18} /> How do you feel right now?
          </h3>

          <label htmlFor="at-mood" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
            Mood: <span style={{ color: '#e2e8f0' }}>{MOOD_SCALE[mood - 1]}</span>
          </label>
          <input id="at-mood" type="range" min="1" max="5" step="1" value={mood} onChange={(e) => setMood(Number(e.target.value))} style={{ width: '100%', accentColor: '#db2777' }} />

          <label htmlFor="at-energy" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.8rem 0 0.3rem' }}>
            Energy: <span style={{ color: '#e2e8f0' }}>{ENERGY_SCALE[energy - 1]}</span>
          </label>
          <input id="at-energy" type="range" min="1" max="5" step="1" value={energy} onChange={(e) => setEnergy(Number(e.target.value))} style={{ width: '100%', accentColor: '#8b5cf6' }} />

          <label htmlFor="at-note" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0.9rem 0 0.3rem' }}>
            Your own words (optional)
          </label>
          <textarea
            id="at-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What was happening while you drew this?"
            style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: '#fff', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit' }}
          />
        </div>

        {/* Tools */}
        <div style={{ background: 'var(--bg-elevated)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--glass-border)', marginTop: '1rem' }}>
          <h3 style={{ color: 'var(--primary)', margin: '0 0 0.9rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
            <Palette size={18} /> Tools
          </h3>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.9rem' }}>
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Colour ${hex}`}
                onClick={() => { setColor(hex); setTool('brush'); }}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: hex,
                  cursor: 'pointer',
                  border: color === hex && tool === 'brush' ? '2px solid #fff' : '2px solid rgba(255,255,255,0.12)',
                  boxShadow: color === hex && tool === 'brush' ? `0 0 10px ${hex}` : 'none',
                }}
              />
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setTool('brush'); }} aria-label="Custom colour" style={{ width: '30px', height: '30px', border: 'none', background: 'transparent', cursor: 'pointer' }} />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.8rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Brush {brushSize}px</span>
            <input type="range" min="2" max="40" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} aria-label="Brush size" style={{ flex: 1, accentColor: '#7c3aed' }} />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setTool('brush')} style={toolBtn(tool === 'brush')}>
              <Brush size={15} /> Brush
            </button>
            <button type="button" onClick={() => setTool('eraser')} style={toolBtn(tool === 'eraser')}>
              <Eraser size={15} /> Eraser
            </button>
            <button type="button" onClick={undo} style={toolBtn(false)}>
              <Undo2 size={15} /> Undo
            </button>
            <button type="button" onClick={clearCanvas} style={toolBtn(false)}>
              <Trash2 size={15} /> Clear
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={toolBtn(false)}>
              <ImagePlus size={15} /> Upload artwork
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />
          </div>
        </div>

        {/* Analyse */}
        <div style={{ marginTop: '1rem', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'rgba(139, 92, 246, 0.07)' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.9rem', lineHeight: 1.45 }}>
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} style={{ marginTop: '0.15rem', accentColor: '#8b5cf6' }} />
            <span>
              Add an AI-written narrative (sends <strong>text only</strong> — measured features + your words; the image never leaves this browser).
            </span>
          </label>

          <button
            type="button"
            onClick={runAnalysis}
            disabled={isAnalyzing}
            style={{
              width: '100%',
              padding: '1rem',
              borderRadius: '8px',
              border: 'none',
              background: isAnalyzing ? '#4c1d95' : 'linear-gradient(90deg, #db2777, #9333ea)',
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '1rem',
              cursor: isAnalyzing ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 0 20px rgba(219, 39, 119, 0.35)',
            }}
          >
            {isAnalyzing ? (
              <>
                <Loader2 size={20} style={{ animation: 'at-spin 1s linear infinite' }} />
                {aiBusy ? 'AI narrative in progress…' : 'Measuring artwork…'}
              </>
            ) : (
              <>
                <Sparkles size={20} /> Analyse artwork
              </>
            )}
          </button>

          {errorMsg && <p style={{ color: 'var(--status-red)', margin: '0.8rem 0 0', fontSize: '0.85rem' }}>{errorMsg}</p>}

          <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', margin: '0.8rem 0 0', lineHeight: 1.5 }}>
            Screening aid for expressive-art sessions. Not a diagnosis, not a psychological test, and not a substitute for a licensed therapist.
          </p>
        </div>
      </div>

      {/* Right: canvas + results */}
      <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="section-header" style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--glass-border)', margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Palette size={18} color="#db2777" /> Your canvas
            </h2>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem' }}>{mode === 'upload' ? 'Uploaded artwork' : 'Draw with mouse, finger or stylus'}</p>
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: '20px', padding: '0.25rem 0.7rem' }}>
            {CANVAS_W} × {CANVAS_H}
          </span>
        </div>

        <div style={{ padding: '1rem 1.5rem 0' }}>
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Art therapy drawing canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishStroke}
            onPointerLeave={finishStroke}
            style={{
              width: '100%',
              height: 'auto',
              aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
              background: PAPER_COLOR,
              borderRadius: '10px',
              border: '1px solid var(--glass-border)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
              touchAction: 'none',
              cursor: tool === 'eraser' ? 'cell' : 'crosshair',
            }}
          />
        </div>

        <div className="custom-scrollbar" style={{ padding: '1rem 1.5rem 1.5rem', overflowY: 'auto' }}>
          {!analysis && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 1rem', animation: 'at-fade 0.4s ease' }}>
              <HeartHandshake size={46} style={{ opacity: 0.25, marginBottom: '0.75rem' }} />
              <p style={{ margin: 0 }}>
                Draw or upload one piece, set the mood sliders on the left, then press <strong>Analyse artwork</strong>.
              </p>
            </div>
          )}

          {analysis && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', animation: 'at-fade 0.45s ease' }}>
              {/* Palette + core metrics */}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.9rem', color: 'var(--text-muted)', fontSize: '0.82rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Measured palette
                </h4>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {analysis.features.palette.map((p) => (
                    <div key={p.hex} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: 'var(--bg-dark)', border: '1px solid var(--glass-border)', borderRadius: '20px', padding: '0.25rem 0.65rem 0.25rem 0.3rem' }}>
                      <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: p.hex, border: '1px solid rgba(255,255,255,0.15)' }} />
                      <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#e2e8f0' }}>{p.hex}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.share}%</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.7rem', marginTop: '1rem' }}>
                  {bar('Colourfulness', analysis.features.colorfulness, '#c084fc')}
                  {bar('Brightness', analysis.features.brightness, '#fbbf24')}
                  {bar('Saturation', analysis.features.saturation, '#db2777')}
                  {bar('Contrast', analysis.features.contrast, '#38bdf8')}
                  {bar('Texture detail', analysis.features.edgeDensity, '#f97316')}
                  {bar('Symmetry', analysis.features.symmetry, '#34d399')}
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.9rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>Warm <strong style={{ color: '#fb923c' }}>{analysis.features.warmRatio}%</strong></span>
                  <span>Cool <strong style={{ color: '#38bdf8' }}>{analysis.features.coolRatio}%</strong></span>
                  <span>Dark <strong style={{ color: '#a78bfa' }}>{analysis.features.darkRatio}%</strong></span>
                  <span>Coverage <strong style={{ color: '#e2e8f0' }}>{analysis.features.coverage}%</strong></span>
                  <span>Harmony <strong style={{ color: '#e2e8f0' }}>{analysis.harmony.type}</strong></span>
                </div>
              </div>

              {/* Affect */}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <h4 style={{ margin: 0, color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.95rem' }}>
                    <ActivityDot /> Affect estimate — {analysis.affect.label}
                  </h4>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>confidence {analysis.affect.confidence}%</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  {bar('Valence', analysis.affect.valence, '#34d399')}
                  {bar('Arousal', analysis.affect.arousal, '#f472b6')}
                </div>
                <p style={{ margin: '0.8rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Valence = how positive the visual pattern reads; arousal = how visually energised it is. Computed from colour, brightness, contrast and texture, blended with your sliders.
                </p>
              </div>

              {/* Narrative */}
              <div style={{ background: 'rgba(147, 51, 234, 0.1)', border: '1px solid rgba(147, 51, 234, 0.3)', borderRadius: '12px', padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h4 style={{ margin: 0, color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                    <Brain size={17} /> Observation
                  </h4>
                  <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-muted)' }}>
                    {analysis.source === 'ai' ? 'AI-assisted' : 'local rule engine'}
                  </span>
                </div>
                <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.65, fontSize: '0.92rem' }}>{analysis.insight}</p>
              </div>

              <div style={{ background: 'rgba(219, 39, 119, 0.08)', border: '1px solid rgba(219, 39, 119, 0.3)', borderRadius: '12px', padding: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.6rem', color: '#f472b6', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                  <Heart size={17} /> Suggested next step
                </h4>
                <p style={{ margin: 0, color: '#e2e8f0', lineHeight: 1.65, fontSize: '0.92rem' }}>{analysis.recommendation}</p>
              </div>

              {showCrisis && (
                <div role="note" style={{ background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.45)', borderRadius: '12px', padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
                    <PhoneCall size={17} /> If you are in distress right now
                  </h4>
                  <p style={{ margin: '0 0 0.6rem', fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                    You do not have to manage this alone. These lines are free and confidential:
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#e2e8f0', fontSize: '0.85rem', lineHeight: 1.7 }}>
                    {CRISIS_LINES.map((line) => (
                      <li key={line.number}>
                        {line.name}: <strong>{line.number}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Patient ID + actions */}
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '1.25rem' }}>
                <label htmlFor="at-patient" style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Patient ID (mandatory to save) *
                </label>
                <input
                  id="at-patient"
                  type="text"
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  placeholder="e.g. PAT-90812"
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-dark)', color: '#fff' }}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.7rem 0 0' }}>
                  <input type="checkbox" checked={attachImage} onChange={(e) => setAttachImage(e.target.checked)} style={{ accentColor: '#db2777' }} />
                  Attach artwork image to the saved record (uploaded to the configured image store)
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem', marginTop: '0.9rem' }}>
                  <button type="button" onClick={handleSave} disabled={isSaving} style={actionBtn('#00e5ff', '#000')}>
                    {isSaving ? <Loader2 size={16} style={{ animation: 'at-spin 1s linear infinite' }} /> : <Save size={16} />}
                    {isSaving ? 'Saving…' : 'Save to record'}
                  </button>
                  <button type="button" onClick={handleDownloadPdf} style={actionBtn('transparent', 'var(--primary)', true)}>
                    <Download size={16} /> Session PDF
                  </button>
                  <button type="button" onClick={handleDownloadPng} style={actionBtn('transparent', '#fff', true)}>
                    <ImagePlus size={16} /> Artwork PNG
                  </button>
                  <button type="button" onClick={handleCopySummary} style={actionBtn('transparent', '#fff', true)}>
                    <Copy size={16} /> Copy summary
                  </button>
                </div>

                <button
                  type="button"
                  onClick={startNewSession}
                  style={{ marginTop: '0.6rem', width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px dashed var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  Start a new blank session
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}>
                <ShieldCheck size={14} />
                The image is measured locally in your browser. Only the text summary and (optionally) the artwork file are stored.
              </div>
            </div>
          )}

          {/* Session log */}
          {sessions.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <h4 style={{ color: 'var(--text-muted)', fontSize: '0.78rem', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 0.6rem' }}>
                This visit · {sessions.length} session{sessions.length > 1 ? 's' : ''}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {sessions.map((s, idx) => (
                  <div key={s.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.6rem 0.75rem' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)', width: '1.4rem' }}>#{sessions.length - idx}</span>
                    {s.thumbnail ? (
                      <img src={s.thumbnail} alt="" style={{ width: '42px', height: '30px', objectFit: 'cover', borderRadius: '4px' }} />
                    ) : (
                      <span style={{ width: '42px', height: '30px', borderRadius: '4px', background: 'var(--bg-dark)' }} />
                    )}
                    <span style={{ flex: 1, fontSize: '0.78rem', color: '#cbd5e1' }}>
                      {new Date(s.at).toLocaleTimeString()} · valence {Math.round(s.affect.valence)} / arousal {Math.round(s.affect.arousal)}
                    </span>
                    <span style={{ display: 'flex', gap: '2px' }}>
                      {s.features.palette.slice(0, 4).map((p) => (
                        <span key={`${s.id}-${p.hex}`} style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.hex }} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ActivityDot = () => (
  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c084fc', display: 'inline-block' }} />
);

const toolBtn = (active) => ({
  padding: '0.45rem 0.7rem',
  borderRadius: '6px',
  border: active ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
  background: active ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
  color: active ? 'var(--primary)' : '#cbd5e1',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.78rem',
});

const actionBtn = (bg, color, outline = false) => ({
  padding: '0.65rem',
  borderRadius: '8px',
  border: outline ? '1px solid var(--glass-border)' : 'none',
  background: bg,
  color,
  fontWeight: 'bold',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.4rem',
  fontSize: '0.82rem',
});

export default ArtTherapy;
