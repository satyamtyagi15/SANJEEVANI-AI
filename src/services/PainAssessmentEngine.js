/**
 * PainAssessmentEngine — real geometry + signal processing for the Pain Tracker.
 *
 * What is real here:
 *  - Every number comes from MediaPipe FaceMesh landmarks (468 points) captured from the
 *    live camera, or from Web Audio FFT/RMS of the live microphone.
 *  - The face is calibrated against the patient's own neutral expression for 3 seconds,
 *    so scores are deviations from that person's baseline, not absolute constants.
 *  - Temporal smoothing, signal-quality and session statistics are computed from the
 *    actual sample stream.
 *
 * What this is NOT:
 *  - It is not a diagnosis and not a validated clinical instrument (no PSPI/NRS validation
 *    in this build). It is a screening aid for patients who cannot reliably self-report
 *    (post-operative, ICU, dementia, paediatric, non-verbal).
 */

import jsPDF from 'jspdf';

/* ------------------------------------------------------------------ */
/* Landmark indices (MediaPipe FaceMesh, 468 points)                   */
/* ------------------------------------------------------------------ */

export const LM = {
  // face frame
  leftFace: 234,
  rightFace: 454,
  forehead: 10,
  chin: 152,
  // eyes
  eyeLo: 33, eyeLi: 133, eyeLu: 159, eyeLd: 145,
  eyeRo: 263, eyeRi: 362, eyeRu: 386, eyeRd: 374,
  // brows
  browLInner: 107, browRInner: 336,
  browLOuter: 55, browROuter: 285,
  browLUpper: 105, browRUpper: 334,
  // nose / mouth
  noseTip: 1, noseBridge: 168, noseL: 129, noseR: 358,
  mouthL: 61, mouthR: 291,
  upperLipIn: 13, lowerLipIn: 14,
  upperLipOut: 0, lowerLipOut: 17,
  // cheeks
  cheekL: 205, cheekR: 425,
  // lower lid anchors for cheek raise
  lidL: 145, lidR: 374,
};

const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : NaN);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v) => clamp(Number.isFinite(v) ? v : 0, 0, 1);

/* ------------------------------------------------------------------ */
/* Raw geometry                                                        */
/* ------------------------------------------------------------------ */

/**
 * Convert 468 landmarks into normalised facial metrics.
 * Returns null when the required points are missing.
 */
export function computeRawMetrics(keypoints) {
  if (!Array.isArray(keypoints) || keypoints.length < 400) return null;

  const faceWidth = dist(keypoints[LM.leftFace], keypoints[LM.rightFace]);
  const faceHeight = dist(keypoints[LM.forehead], keypoints[LM.chin]);
  if (!(faceWidth > 20) || !(faceHeight > 20)) return null;

  const earL = dist(keypoints[LM.eyeLu], keypoints[LM.eyeLd]) / Math.max(1e-6, dist(keypoints[LM.eyeLo], keypoints[LM.eyeLi]));
  const earR = dist(keypoints[LM.eyeRu], keypoints[LM.eyeRd]) / Math.max(1e-6, dist(keypoints[LM.eyeRo], keypoints[LM.eyeRi]));

  const browGap = dist(keypoints[LM.browLInner], keypoints[LM.browRInner]) / faceWidth;
  const browOuter = dist(keypoints[LM.browLOuter], keypoints[LM.browROuter]) / faceWidth;

  const eyeToBrowL = dist(keypoints[LM.browLInner], keypoints[LM.eyeLu]) / faceHeight;
  const eyeToBrowR = dist(keypoints[LM.browRInner], keypoints[LM.eyeRu]) / faceHeight;

  const mouthWidth = dist(keypoints[LM.mouthL], keypoints[LM.mouthR]) / faceWidth;
  const mouthOpen = dist(keypoints[LM.upperLipIn], keypoints[LM.lowerLipIn]) / faceHeight;

  const mouthCenterY = (keypoints[LM.upperLipIn].y + keypoints[LM.lowerLipIn].y) / 2;
  const cornerY = (keypoints[LM.mouthL].y + keypoints[LM.mouthR].y) / 2;
  // Positive = corners pulled up (smile direction).
  const lipCornerLift = (mouthCenterY - cornerY) / faceHeight;

  const lipNoseGap = dist(keypoints[LM.noseTip], keypoints[LM.upperLipOut]) / faceHeight;

  const cheekL = dist(keypoints[LM.lidL], keypoints[LM.cheekL]) / faceWidth;
  const cheekR = dist(keypoints[LM.lidR], keypoints[LM.cheekR]) / faceWidth;

  const eyeTilt = Math.atan2(
    keypoints[LM.eyeRo].y - keypoints[LM.eyeLo].y,
    keypoints[LM.eyeRo].x - keypoints[LM.eyeLo].x
  ) * (180 / Math.PI);

  // Coarse face box fraction of the analysed frame is supplied by the caller; here we
  // return a relative "face size" proxy that is resolution independent.
  return {
    faceWidth,
    faceHeight,
    ear: (earL + earR) / 2,
    earL,
    earR,
    browGap,
    browOuter,
    browHeight: (eyeToBrowL + eyeToBrowR) / 2,
    mouthWidth,
    mouthOpen,
    lipCornerLift,
    lipNoseGap,
    cheekRaise: (cheekL + cheekR) / 2,
    eyeTilt,
    time: performance.now(),
  };
}

/* ------------------------------------------------------------------ */
/* Calibration                                                         */
/* ------------------------------------------------------------------ */

/** Literature-ish neutral fallbacks used only when calibration could not run. */
export const DEFAULT_BASELINE = {
  ear: 0.32,
  browGap: 0.115,
  browHeight: 0.085,
  mouthWidth: 0.36,
  mouthOpen: 0.012,
  lipCornerLift: 0.002,
  lipNoseGap: 0.055,
  cheekRaise: 0.105,
  calibrated: false,
};

/**
 * Median-based baseline from ~3 s of neutral frames. Median is used because it is
 * robust to blinks and single-frame tracking glitches.
 */
export function createBaseline(samples) {
  const valid = samples.filter(Boolean);
  if (valid.length < 12) return { ...DEFAULT_BASELINE, calibrated: false, frames: valid.length };

  const med = (key) => {
    const arr = valid.map((s) => s[key]).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!arr.length) return DEFAULT_BASELINE[key];
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
  };

  return {
    ear: med('ear'),
    browGap: med('browGap'),
    browHeight: med('browHeight'),
    mouthWidth: med('mouthWidth'),
    mouthOpen: med('mouthOpen'),
    lipCornerLift: med('lipCornerLift'),
    lipNoseGap: med('lipNoseGap'),
    cheekRaise: med('cheekRaise'),
    calibrated: true,
    frames: valid.length,
  };
}

/* ------------------------------------------------------------------ */
/* Per-frame scoring                                                   */
/* ------------------------------------------------------------------ */

/**
 * Convert raw metrics into action-unit style deviations and a 0–100 facial pain score.
 * Weights are explicit so the score can be audited/explained.
 */
export function scoreFrame(raw, baseline, quality = 100) {
  if (!raw) {
    return {
      facialScore: 0,
      au: { brow: 0, eye: 0, jaw: 0, mouth: 0, lip: 0, cheek: 0 },
      expression: 'NO FACE',
      smiling: false,
      quality: 0,
    };
  }

  const b = baseline || DEFAULT_BASELINE;

  const browLower = clamp01((b.browGap - raw.browGap) / Math.max(0.012, b.browGap * 0.32));
  const eyeSqueeze = clamp01((b.ear - raw.ear) / Math.max(0.05, b.ear * 0.45));
  const jawOpen = clamp01((raw.mouthOpen - b.mouthOpen) / 0.055);
  const mouthStretch = clamp01((raw.mouthWidth - b.mouthWidth) / 0.10);
  const lipRaise = clamp01((b.lipNoseGap - raw.lipNoseGap) / 0.022);
  const cheekRaise = clamp01((b.cheekRaise - raw.cheekRaise) / 0.045);
  const browRaise = clamp01((raw.browHeight - b.browHeight) / 0.03);

  // Smile guard: smiling raises mouth corners and widens the mouth without brow lowering.
  const smileEvidence =
    (raw.lipCornerLift - b.lipCornerLift) > 0.010 &&
    (raw.mouthWidth - b.mouthWidth) > 0.045 &&
    browLower < 0.35;

  let facialScore =
    100 *
    (0.28 * browLower +
      0.18 * eyeSqueeze +
      0.18 * jawOpen +
      0.12 * mouthStretch +
      0.12 * lipRaise +
      0.12 * cheekRaise);
  facialScore = clamp(facialScore, 0, 100);
  if (smileEvidence) facialScore *= 0.25;

  let expression = 'NEUTRAL';
  if (smileEvidence) {
    expression = raw.mouthOpen > b.mouthOpen + 0.02 ? 'SMILING / RELAXED' : 'SMILE';
  } else if (facialScore > 78) {
    expression = 'SEVERE PAIN ';
  } else if (facialScore > 55) {
    expression = 'PAIN / GRIMACE';
  } else if (facialScore > 28) {
    expression = 'DISCOMFORT';
  } else if (browRaise > 0.6 && eyeSqueeze < 0.25) {
    expression = 'SURPRISED / ALERT';
  }

  return {
    facialScore: Math.round(facialScore * 10) / 10,
    au: {
      brow: round(browLower * 100),
      eye: round(eyeSqueeze * 100),
      jaw: round(jawOpen * 100),
      mouth: round(mouthStretch * 100),
      lip: round(lipRaise * 100),
      cheek: round(cheekRaise * 100),
    },
    expression,
    smiling: smileEvidence,
    quality: Math.round(clamp(quality, 0, 100)),
  };
}

function round(v) {
  return Math.round(v);
}

/* ------------------------------------------------------------------ */
/* Audio scoring                                                       */
/* ------------------------------------------------------------------ */

/**
 * Vocal distress proxy from time-domain RMS + high-frequency ratio.
 * `noiseFloor` is the quietest RMS observed during calibration / idle windows.
 */
export function scoreVocal({ rms = 0, hfRatio = 0, zcr = 0 }, noiseFloor = 0.02) {
  const floor = Math.max(0.008, noiseFloor);
  if (rms < floor * 1.6) return 0;
  const loudness = clamp01((rms - floor) / 0.28);
  const harshness = clamp01((hfRatio - 0.28) / 0.5);
  const noisiness = clamp01((zcr - 0.12) / 0.5);
  const score = (0.55 * loudness + 0.28 * harshness + 0.17 * noisiness) * 100;
  return Math.round(clamp(score, 0, 100));
}

/* ------------------------------------------------------------------ */
/* Fusion + smoothing                                                  */
/* ------------------------------------------------------------------ */

export function combineChannels({ facialScore, vocalScore, quality, hasAudio }) {
  if (quality < 18) return 0;
  const faceWeight = hasAudio ? 0.78 : 1;
  const vocalWeight = hasAudio ? 0.22 : 0;
  let fused = facialScore * faceWeight + vocalScore * vocalWeight;
  if (facialScore > 40 && vocalScore > 40) fused += 8; // multimodal agreement
  return Math.round(clamp(fused, 0, 100));
}

export function ema(previous, next, alpha = 0.22) {
  if (!Number.isFinite(previous)) return next;
  return previous + (next - previous) * alpha;
}

/* ------------------------------------------------------------------ */
/* Severity bands                                                      */
/* ------------------------------------------------------------------ */

export function severityBand(score100) {
  const nrs = clamp(score100 / 10, 0, 10);
  if (nrs >= 7) {
    return {
      nrs,
      label: 'Severe distress pattern',
      band: 'severe',
      color: '#f87171',
      advice: 'Consider immediate clinical review and a validated pain scale (NRS/FACES/FLACC) as the primary assessment.',
    };
  }
  if (nrs >= 4) {
    return {
      nrs,
      label: 'Moderate distress pattern',
      band: 'moderate',
      color: '#fbbf24',
      advice: 'Reassess in 5–10 minutes; check position, medication timing and comfort measures.',
    };
  }
  if (nrs >= 1) {
    return {
      nrs,
      label: 'Mild / low distress pattern',
      band: 'mild',
      color: '#34d399',
      advice: 'Continue routine observation; document the reading with the clinical context.',
    };
  }
  return {
    nrs,
    label: 'No distress pattern detected',
    band: 'none',
    color: '#34d399',
    advice: 'No facial/vocal pain pattern detected in this window.',
  };
}

/* ------------------------------------------------------------------ */
/* Session statistics                                                  */
/* ------------------------------------------------------------------ */

export function summarizeSession(samples, meta = {}) {
  const valid = samples.filter((s) => Number.isFinite(s.pain));
  const durationMs = valid.length > 1 ? valid[valid.length - 1].t - valid[0].t : 0;
  const pains = valid.map((s) => s.pain);
  const mean = pains.length ? pains.reduce((a, b) => a + b, 0) / pains.length : 0;
  const peak = pains.length ? Math.max(...pains) : 0;
  const sorted = [...pains].sort((a, b) => a - b);
  const p90 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : 0;

  const timeAbove = (threshold) =>
    valid.filter((s) => s.pain >= threshold).length; // samples are 1 s apart

  const qualityValues = valid.map((s) => s.quality).filter(Number.isFinite);
  const avgQuality = qualityValues.length ? qualityValues.reduce((a, b) => a + b, 0) / qualityValues.length : 0;

  const expressionCounts = {};
  valid.forEach((s) => {
    expressionCounts[s.expression] = (expressionCounts[s.expression] || 0) + 1;
  });
  const dominantExpression = Object.entries(expressionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  // Linear trend in pain units per minute.
  let trendPerMinute = 0;
  if (valid.length > 3) {
    const t0 = valid[0].t;
    const xs = valid.map((s) => (s.t - t0) / 60000);
    const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const yMean = mean;
    let num = 0;
    let den = 0;
    xs.forEach((x, i) => {
      num += (x - xMean) * (pains[i] - yMean);
      den += (x - xMean) ** 2;
    });
    trendPerMinute = den ? num / den : 0;
  }

  const band = severityBand(mean);

  return {
    startedAt: valid.length ? new Date(valid[0].t).toISOString() : new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationSec: Math.round(durationMs / 1000),
    sampleCount: valid.length,
    meanPain: round(mean),
    peakPain: round(peak),
    p90Pain: round(p90),
    nrsMean: Math.round((mean / 10) * 10) / 10,
    nrsPeak: Math.round((peak / 10) * 10) / 10,
    secondsAbove4: timeAbove(40),
    secondsAbove7: timeAbove(70),
    avgQuality: round(avgQuality),
    dominantExpression,
    trendPerMinute: Math.round(trendPerMinute * 10) / 10,
    trendLabel:
      Math.abs(trendPerMinute) < 0.5 ? 'stable' : trendPerMinute > 0 ? 'worsening' : 'improving',
    band: band.band,
    bandLabel: band.label,
    mode: meta.mode || 'camera',
    audioEnabled: Boolean(meta.audioEnabled),
    calibrated: Boolean(meta.calibrated),
    note: meta.note || '',
    series: valid.filter((_, i) => i % Math.max(1, Math.ceil(valid.length / 120)) === 0).map((s) => ({
      t: s.t,
      pain: s.pain,
    })),
  };
}

export function buildEhrPayload(summary, patientId) {
  return {
    patientId,
    type: 'PainTracker',
    data: {
      kind: 'pain-screening-session',
      summary,
      disclaimer:
        'Automated facial/vocal pain screening aid. Not a diagnosis and not a validated clinical instrument. Confirm with the patient (or an observer proxy) using a validated scale.',
    },
  };
}

/* ------------------------------------------------------------------ */
/* PDF export                                                          */
/* ------------------------------------------------------------------ */

export function downloadSessionPDF(summary, patientId, clinicianNote = '') {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const width = pdf.internal.pageSize.getWidth();
  let y = 18;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(15, 30, 60);
  pdf.text('SANJEEVANI AI', width / 2, y, { align: 'center' });
  y += 7;
  pdf.setFontSize(11);
  pdf.setTextColor(90, 90, 90);
  pdf.text('PAIN SCREENING SESSION REPORT', width / 2, y, { align: 'center' });
  y += 8;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(18, y, width - 18, y);
  y += 8;

  const row = (label, value) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(40, 40, 40);
    pdf.text(String(label), 18, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(60, 60, 60);
    pdf.text(String(value), 70, y);
    y += 6;
  };

  row('Patient ID', patientId || 'Anonymous');
  row('Started', new Date(summary.startedAt).toLocaleString());
  row('Duration', formatDuration(summary.durationSec));
  row('Mode', summary.mode === 'camera' ? 'Camera + microphone (live)' : 'Manual self-report');
  row('Calibration', summary.calibrated ? 'Completed (3 s neutral baseline)' : 'Not completed (default baseline)');
  row('Samples', summary.sampleCount);

  y += 2;
  pdf.setDrawColor(220, 220, 220);
  pdf.line(18, y, width - 18, y);
  y += 8;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(15, 30, 60);
  pdf.text('RESULTS', 18, y);
  y += 8;

  row('Mean pain index', `${summary.meanPain}/100  (NRS ≈ ${summary.nrsMean}/10)`);
  row('Peak pain index', `${summary.peakPain}/100  (NRS ≈ ${summary.nrsPeak}/10)`);
  row('90th percentile', `${summary.p90Pain}/100`);
  row('Time at/above moderate', `${summary.secondsAbove4} s`);
  row('Time at/above severe', `${summary.secondsAbove7} s`);
  row('Dominant expression', summary.dominantExpression);
  row('Signal quality (avg)', `${summary.avgQuality}/100`);
  row('Trend', `${summary.trendLabel} (${summary.trendPerMinute}/min)`);
  row('Classification', summary.bandLabel);

  // Trend sparkline
  if (Array.isArray(summary.series) && summary.series.length > 2) {
    y += 4;
    const x0 = 18;
    const chartW = width - 36;
    const chartH = 38;
    pdf.setDrawColor(225, 225, 225);
    pdf.rect(x0, y, chartW, chartH);
    pdf.setDrawColor(200, 200, 205);
    [0.25, 0.5, 0.75].forEach((f) => pdf.line(x0, y + chartH * f, x0 + chartW, y + chartH * f));
    pdf.setDrawColor(220, 60, 60);
    pdf.setLineWidth(0.7);
    const points = summary.series.map((p, i) => [
      x0 + (i / (summary.series.length - 1)) * chartW,
      y + chartH - (p.pain / 100) * chartH,
    ]);
    for (let i = 1; i < points.length; i += 1) {
      pdf.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text('Pain index over time', x0 + 2, y + 5);
    y += chartH + 8;
  }

  if (clinicianNote.trim()) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(40, 40, 40);
    pdf.text('Clinician note', 18, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    const lines = pdf.splitTextToSize(clinicianNote.trim(), width - 36);
    pdf.text(lines, 18, y);
    y += lines.length * 5 + 4;
  }

  pdf.setFont('helvetica', 'italic');
  pdf.setFontSize(8);
  pdf.setTextColor(150, 150, 150);
  const footer =
    'Automated facial/vocal pain screening aid. Not a diagnosis, not a validated clinical instrument. ' +
    'Confirm with a validated pain scale and clinical judgement.';
  pdf.text(pdf.splitTextToSize(footer, width - 36), 18, 285);

  pdf.save(`Sanjeevani_PainSession_${patientId || 'Anonymous'}.pdf`);
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}m ${String(rest).padStart(2, '0')}s`;
}
