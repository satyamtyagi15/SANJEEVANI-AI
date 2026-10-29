/**
 * ArtTherapyEngine — real, pixel-based analysis for the Art Therapy module.
 *
 * Design goals (and why):
 *  - Everything here is computed from the *actual* artwork pixels the patient produced.
 *    There is no random value and no fabricated metric in this file.
 *  - The colour/affect mapping is a transparent, documented rule set (not a diagnosis).
 *    It is intentionally explainable so a therapist can see *why* the app said something.
 *  - The module works fully offline; the optional LLM narrative is an enhancement, never
 *    the source of the measurements.
 *
 * The only non-deterministic part is `getRandomPrompt` (guided prompt rotation), which
 * is a UI helper, not an analysis output.
 */

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const GUIDED_PROMPTS = [
  { id: 'safe-place', theme: 'Grounding', text: 'Draw a place where your body feels completely safe. Do not plan it — start with one colour that feels like "safety" to you.' },
  { id: 'body-map', theme: 'Somatic', text: 'Draw the outline of a body. Colour where you feel tension, heaviness, or numbness today. Leave the rest empty.' },
  { id: 'weather', theme: 'Mood', text: 'If your current mood were weather, what would it look like? Draw that sky — clouds, light, wind, rain.' },
  { id: 'three-colours', theme: 'Limits', text: 'Choose only three colours. Use them to show what you want more of, what you want less of, and what you are unsure about.' },
  { id: 'unfinished', theme: 'Trauma-safe', text: 'Draw something you can leave unfinished on purpose. Notice how it feels to stop before it is "complete".' },
  { id: 'hands', theme: 'Connection', text: 'Draw two hands that are not touching. Put the distance between them exactly where it feels true.' },
  { id: 'inside-outside', theme: 'Boundaries', text: 'Split the page. On one side draw what people see; on the other, what they do not.' },
  { id: 'small-joy', theme: 'Positive affect', text: 'Draw the smallest good moment from the last seven days. Make it as big as it felt.' },
];

const MOOD_LABELS = ['Very low', 'Low', 'Neutral', 'Good', 'Very good'];
const ENERGY_LABELS = ['Calm / still', 'Settled', 'Moderate', 'Restless', 'Intense'];

export const MOOD_SCALE = MOOD_LABELS;
export const ENERGY_SCALE = ENERGY_LABELS;

/** Paper colour the drawing canvas starts with; treated as "not artwork" during analysis. */
export const PAPER_COLOR = '#f4f1ea';
const PAPER_RGB = hexToRgb(PAPER_COLOR);

/** Marks the known hard-coded fallback string in AIEngine.analyzeArtTherapyEmotion. */
const AI_FALLBACK_MARKER = 'intense raw desires';

export const CRISIS_LINES = [
  { name: 'Tele-MANAS (India, 24x7)', number: '14416' },
  { name: 'KIRAN Mental Health Helpline', number: '1800-599-0019' },
  { name: 'Emergency', number: '112' },
];

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const int = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(int)) return { r: 120, g: 120, b: 120 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex(r, g, b) {
  const to = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function getRandomPrompt(previousId) {
  const pool = GUIDED_PROMPTS.filter((p) => p.id !== previousId);
  return pool[Math.floor(Math.random() * pool.length)] || GUIDED_PROMPTS[0];
}

/** Human-readable colour name from hue, used only in the local narrative. */
export function colorName(hex) {
  const { h, s, v } = rgbToHsv(...Object.values(hexToRgb(hex)));
  if (s < 0.12) return v > 0.85 ? 'off-white' : v < 0.2 ? 'near-black' : 'grey';
  if (h < 15 || h >= 345) return 'crimson';
  if (h < 35) return 'rust';
  if (h < 55) return 'amber';
  if (h < 75) return 'gold';
  if (h < 105) return 'lime';
  if (h < 150) return 'green';
  if (h < 180) return 'teal';
  if (h < 200) return 'cyan';
  if (h < 235) return 'azure';
  if (h < 265) return 'indigo';
  if (h < 290) return 'violet';
  if (h < 320) return 'magenta';
  return 'rose';
}

/* ------------------------------------------------------------------ */
/* Image loading + feature extraction                                  */
/* ------------------------------------------------------------------ */

const ANALYSIS_MAX = 320;

function createAnalysisCanvas(source) {
  const w = source.naturalWidth || source.width || 0;
  const h = source.naturalHeight || source.height || 0;
  if (!w || !h) throw new Error('Artwork has no readable pixels yet. Draw something first.');

  const scale = Math.min(1, ANALYSIS_MAX / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/**
 * Compute measurable properties of the artwork.
 * @param {HTMLCanvasElement|HTMLImageElement} source
 * @param {{background?: 'paper'|'auto'}} options 'paper' excludes the known canvas paper
 *        colour (used for the built-in drawing canvas); 'auto' samples the corners
 *        (used for uploaded photographs, which have no uniform background).
 * Returns a plain object so it can be stored/exported without DOM references.
 */
export function analyzeImageElement(source, options = {}) {
  const { canvas, ctx } = createAnalysisCanvas(source);
  const { width: W, height: H } = canvas;
  const { data } = ctx.getImageData(0, 0, W, H);

  const backgroundMode = options.background === 'paper' ? 'paper' : 'auto';
  const isPaperBg = backgroundMode === 'paper';
  const bgThreshold = isPaperBg ? 34 : 12;

  // Background reference: the known paper colour, or the average of the four corners.
  const bg = isPaperBg
    ? { ...PAPER_RGB }
    : (() => {
        const idx = (x, y) => (y * W + x) * 4;
        const corners = [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]].map(([x, y]) => {
          const i = idx(x, y);
          return [data[i], data[i + 1], data[i + 2], data[i + 3]];
        });
        return {
          r: Math.round(corners.reduce((a, c) => a + c[0], 0) / corners.length),
          g: Math.round(corners.reduce((a, c) => a + c[1], 0) / corners.length),
          b: Math.round(corners.reduce((a, c) => a + c[2], 0) / corners.length),
        };
      })();

  const totalPixels = W * H;
  const foreground = []; // {r,g,b,h,s,v,l}
  const paletteBuckets = new Map();
  const hueHistogram = new Array(12).fill(0);
  let lumSum = 0;
  let lumSqSum = 0;
  let satSum = 0;
  let valSum = 0;
  let hueX = 0;
  let hueY = 0;
  let warm = 0;
  let cool = 0;
  let greenish = 0;
  let dark = 0;
  let bright = 0;
  let rgMean = 0;
  let ybMean = 0;
  const rgValues = [];
  const ybValues = [];

  for (let p = 0; p < totalPixels; p += 1) {
    const i = p * 4;
    const alpha = data[i + 3];
    if (alpha < 24) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const distBg = Math.sqrt((r - bg.r) ** 2 + (g - bg.g) ** 2 + (b - bg.b) ** 2);
    if (distBg < bgThreshold) continue; // background

    const { h, s, v } = rgbToHsv(r, g, b);
    const l = 0.299 * r + 0.587 * g + 0.114 * b;

    foreground.push({ r, g, b, h, s, v, l });
    lumSum += l;
    lumSqSum += l * l;
    satSum += s;
    valSum += v;
    hueX += Math.cos((h * Math.PI) / 180) * s;
    hueY += Math.sin((h * Math.PI) / 180) * s;
    if (s > 0.08) {
      hueHistogram[Math.min(11, Math.floor(h / 30))] += 1;
      if (h < 75 || h >= 315) warm += 1;
      else if (h >= 75 && h < 150) greenish += 1;
      else if (h >= 150 && h < 285) cool += 1;
    }
    if (l < 60) dark += 1;
    if (l > 215) bright += 1;

    // Hasler & Süsstrunk (2003) colourfulness intermediates.
    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    rgValues.push(rg);
    ybValues.push(yb);
    rgMean += rg;
    ybMean += yb;

    // Palette quantisation: 5 bits per channel, then merge.
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const bucket = paletteBuckets.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.n += 1;
    paletteBuckets.set(key, bucket);
  }

  const fgCount = foreground.length;
  if (fgCount < 40) {
    throw new Error('Not enough artwork to analyse yet — add a few more strokes or upload an image.');
  }

  const n = fgCount;
  rgMean /= n;
  ybMean /= n;
  let varRg = 0;
  let varYb = 0;
  for (let i = 0; i < n; i += 1) {
    varRg += (rgValues[i] - rgMean) ** 2;
    varYb += (ybValues[i] - ybMean) ** 2;
  }
  varRg = Math.sqrt(varRg / n);
  varYb = Math.sqrt(varYb / n);
  const colorfulness = Math.sqrt(varRg ** 2 + varYb ** 2) + 0.3 * Math.sqrt(rgMean ** 2 + ybMean ** 2);

  const meanLum = lumSum / n;
  const variance = Math.max(0, lumSqSum / n - meanLum ** 2);
  const meanSat = satSum / n;
  const meanVal = valSum / n;
  const meanHue = ((Math.atan2(hueY, hueX) * 180) / Math.PI + 360) % 360;

  const hueTotal = hueHistogram.reduce((a, b) => a + b, 0) || 1;
  let hueEntropy = 0;
  hueHistogram.forEach((c) => {
    if (c > 0) {
      const p = c / hueTotal;
      hueEntropy -= p * Math.log2(p);
    }
  });
  hueEntropy = hueEntropy / Math.log2(12); // 0..1

  // Palette: average colour per bucket, merge perceptually close buckets (anti-aliasing,
  // gradients and brush texture otherwise split one perceived colour into dozens),
  // then keep the six largest clusters.
  const sortedBuckets = [...paletteBuckets.values()]
    .map((b) => ({ r: b.r / b.n, g: b.g / b.n, b: b.b / b.n, n: b.n }))
    .sort((a, b) => b.n - a.n);
  const mergedBuckets = [];
  sortedBuckets.forEach((candidate) => {
    const near = mergedBuckets.find(
      (m) => Math.hypot(candidate.r - m.r, candidate.g - m.g, candidate.b - m.b) < 46
    );
    if (near) {
      const total = near.n + candidate.n;
      near.r = (near.r * near.n + candidate.r * candidate.n) / total;
      near.g = (near.g * near.n + candidate.g * candidate.n) / total;
      near.b = (near.b * near.n + candidate.b * candidate.n) / total;
      near.n = total;
    } else {
      mergedBuckets.push({ ...candidate });
    }
  });
  const palette = mergedBuckets
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((c) => {
      const hex = rgbToHex(c.r, c.g, c.b);
      return { hex, name: colorName(hex), share: Math.round((c.n / n) * 100) };
    });

  // Edge density (Sobel) — how much fine detail / texture the piece has.
  const gray = new Float32Array(W * H);
  for (let p = 0; p < totalPixels; p += 1) {
    const i = p * 4;
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  let edgeCount = 0;
  let edgeSum = 0;
  for (let y = 1; y < H - 1; y += 1) {
    for (let x = 1; x < W - 1; x += 1) {
      const at = (dx, dy) => gray[(y + dy) * W + (x + dx)];
      const gx = -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1) + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
      const mag = Math.sqrt(gx * gx + gy * gy);
      edgeSum += mag;
      if (mag > 120) edgeCount += 1;
    }
  }
  const edgeDensity = clamp((edgeCount / totalPixels) * 100 * 6, 0, 100);
  const meanEdge = edgeSum / totalPixels;

  // Left/right symmetry of the drawn content (mirrored luminance difference).
  let symSum = 0;
  let symCount = 0;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W / 2; x += 2) {
      const left = gray[y * W + x];
      const right = gray[y * W + (W - 1 - x)];
      if (left > 0 || right > 0) {
        symSum += Math.abs(left - right);
        symCount += 1;
      }
    }
  }
  const symmetry = symCount ? clamp(100 - (symSum / symCount) * 1.2, 0, 100) : 0;

  const coverage = clamp((fgCount / totalPixels) * 100, 0, 100);

  return {
    width: W,
    height: H,
    analyzedPixels: n,
    coverage: round1(coverage),
    palette,
    dominantHex: palette[0]?.hex || PAPER_COLOR,
    colorfulness: round1(clamp(colorfulness * 1.3, 0, 100)),
    colorVariety: round1(hueEntropy * 100),
    brightness: round1((meanLum / 255) * 100),
    contrast: round1(clamp((Math.sqrt(variance) / 80) * 100, 0, 100)),
    saturation: round1(meanSat * 100),
    vividness: round1(meanVal * 100),
    warmRatio: round1((warm / (hueTotal || 1)) * 100),
    coolRatio: round1((cool / (hueTotal || 1)) * 100),
    greenRatio: round1((greenish / (hueTotal || 1)) * 100),
    darkRatio: round1((dark / n) * 100),
    brightRatio: round1((bright / n) * 100),
    hueEntropy: round1(hueEntropy * 100),
    meanHue: Math.round(meanHue),
    edgeDensity: round1(edgeDensity),
    textureDetail: round1(clamp(meanEdge * 2.2, 0, 100)),
    symmetry: round1(symmetry),
    // derived descriptive bands used by the UI
    detailBand: edgeDensity > 62 ? 'high' : edgeDensity > 28 ? 'moderate' : 'low',
    balanceBand: Math.abs(symmetry - 50) < 12 ? 'balanced' : symmetry > 62 ? 'balanced' : 'asymmetric',
  };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Affect mapping (transparent, rule-based)                            */
/* ------------------------------------------------------------------ */

/**
 * Map measurable artwork properties (+ optional self-report) onto a valence/arousal
 * estimate (Russell's circumplex). This is a *screening aid*, not a psychological test.
 *
 * @param {object} f output of analyzeImageElement
 * @param {{mood?:number, energy?:number}} selfReport 1..5 sliders (optional)
 */
export function mapAffect(f, selfReport = {}) {
  // Valence: brighter, warmer, more colourful artwork scores higher; heavy dark mass lowers it.
  const valenceArt =
    0.30 * f.brightness +
    0.18 * f.warmRatio +
    0.22 * f.colorfulness +
    0.14 * (100 - f.darkRatio) +
    0.08 * f.symmetry +
    0.08 * f.colorVariety -
    0.12 * f.edgeDensity;

  // Arousal: energy in colour, texture, contrast and saturation.
  const arousalArt =
    0.30 * f.colorfulness +
    0.24 * f.edgeDensity +
    0.18 * f.saturation +
    0.16 * f.contrast +
    0.12 * f.darkRatio;

  const selfValence = typeof selfReport.mood === 'number' ? ((selfReport.mood - 1) / 4) * 100 : null;
  const selfArousal = typeof selfReport.energy === 'number' ? ((selfReport.energy - 1) / 4) * 100 : null;

  const valence = clamp(
    selfValence === null ? valenceArt : 0.6 * valenceArt + 0.4 * selfValence,
    0,
    100
  );
  const arousal = clamp(
    selfArousal === null ? arousalArt : 0.6 * arousalArt + 0.4 * selfArousal,
    0,
    100
  );

  let quadrant;
  if (valence >= 50 && arousal >= 50) quadrant = 'energised-positive';
  else if (valence >= 50 && arousal < 50) quadrant = 'calm-positive';
  else if (valence < 50 && arousal >= 50) quadrant = 'tense-negative';
  else quadrant = 'low-energy-negative';

  const label = {
    'energised-positive': 'Energised / positive',
    'calm-positive': 'Calm / positive',
    'tense-negative': 'Tense / distressing',
    'low-energy-negative': 'Low / withdrawn',
  }[quadrant];

  // Confidence grows with how much actual artwork there is to measure.
  const confidence = Math.round(clamp(35 + f.coverage * 0.55 + Math.min(25, f.analyzedPixels / 400), 35, 95));

  return {
    valence: round1(valence),
    arousal: round1(arousal),
    quadrant,
    label,
    confidence,
    selfValence,
    selfArousal,
  };
}

/* ------------------------------------------------------------------ */
/* Colour harmony                                                      */
/* ------------------------------------------------------------------ */

export function colorHarmony(palette) {
  const hues = palette
    .filter((p) => {
      const { s } = rgbToHsv(...Object.values(hexToRgb(p.hex)));
      return s > 0.15;
    })
    .map((p) => rgbToHsv(...Object.values(hexToRgb(p.hex))).h)
    .sort((a, b) => a - b);

  if (hues.length < 2) return { type: 'monochrome', note: 'Essentially one hue — a focused, single-channel expression.' };

  let maxGap = 0;
  for (let i = 0; i < hues.length; i += 1) {
    const next = i === hues.length - 1 ? hues[0] + 360 : hues[i + 1];
    maxGap = Math.max(maxGap, next - hues[i]);
  }
  const spread = 360 - maxGap;

  if (spread < 25) return { type: 'monochrome', note: 'Close hues — tight, inward, single-emotion feel.' };
  if (spread < 90) return { type: 'analogous', note: 'Neighbouring hues — cohesive and flowing, low visual conflict.' };
  if (spread > 150) return { type: 'complementary', note: 'Opposing hues — high visual tension, often used to express conflict or contrast.' };
  return { type: 'varied', note: 'Many different hues — broad emotional range or a search for balance.' };
}

/* ------------------------------------------------------------------ */
/* Local (offline) narrative — deterministic and honest                */
/* ------------------------------------------------------------------ */

export function localReflection(f, affect, harmony, prompt) {
  const top = f.palette.slice(0, 3).map((p) => `${p.name} (${p.hex}, ${p.share}%)`).join(', ');
  const detailWord = f.detailBand;
  const spaceWord = f.coverage > 55 ? 'the page is mostly covered' : f.coverage > 25 ? 'the page is partly used' : 'most of the page is left empty';

  const insight =
    `Measured reading of this piece: colourfulness ${f.colorfulness}/100, brightness ${f.brightness}/100, ` +
    `warm tones ${f.warmRatio}% vs cool tones ${f.coolRatio}%, texture detail ${f.detailBand}, symmetry ${f.symmetry}/100, ` +
    `and ${spaceWord}. The dominant colours are ${top}. ` +
    `That combination sits in the "${affect.label}" region of the valence/arousal grid ` +
    `(${affect.valence}/100 valence, ${affect.arousal}/100 arousal, confidence ${affect.confidence}%). ` +
    `Colour relationship: ${harmony.type} — ${harmony.note}`;

  const recommendationByQuadrant = {
    'energised-positive': 'The artwork carries both energy and warmth. A useful next step is to name one specific thing that generated this energy so it can be repeated, rather than staying abstract.',
    'calm-positive': 'The piece is steady and low-arousal. Notice whether this calm feels restorative or flat: if restorative, note what made it possible; if flat, try adding one deliberate mark that represents something you want.',
    'tense-negative': 'High energy plus darker valence usually means something is active and uncomfortable. Try a second page that continues the same image for two more minutes, then write one sentence about what changed.',
    'low-energy-negative': 'Low energy and heavy/dark areas can reflect withdrawal or fatigue. Start smaller than feels useful: one colour, one shape, and check whether even that felt effortful.',
  };

  return {
    insight,
    recommendation: recommendationByQuadrant[affect.quadrant] + (detailWord === 'high' ? ' The high level of texture suggests a lot is being processed at once — pacing the session may help.' : ''),
    source: 'local',
    promptUsed: prompt || '',
  };
}

/* ------------------------------------------------------------------ */
/* AI narrative (optional enhancement)                                 */
/* ------------------------------------------------------------------ */

/** Compose the text that is sent to the existing AI helper (text only, never the image). */
export function buildAiContext({ features, affect, harmony, selfReport, note, prompt }) {
  return [
    'PATIENT-SUBMITTED ARTWORK — measured properties (computed from pixels, not guessed):',
    `- dominant palette: ${features.palette.map((p) => `${p.hex} (${p.name}) ${p.share}%`).join(', ')}`,
    `- colourfulness ${features.colorfulness}/100, brightness ${features.brightness}/100, contrast ${features.contrast}/100, saturation ${features.saturation}/100`,
    `- warm ${features.warmRatio}% / cool ${features.coolRatio}% / green ${features.greenRatio}%`,
    `- detail ${features.detailBand} (edge density ${features.edgeDensity}/100), coverage ${features.coverage}%, symmetry ${features.symmetry}/100`,
    `- colour relationship: ${harmony.type}`,
    `- rule-based affect estimate: valence ${affect.valence}/100, arousal ${affect.arousal}/100, quadrant "${affect.quadrant}"`,
    selfReport.mood ? `- self-reported mood: ${selfReport.mood}/5` : '',
    selfReport.energy ? `- self-reported energy: ${selfReport.energy}/5` : '',
    prompt ? `- guided prompt given: "${prompt}"` : '',
    note ? `- patient's own words: "${note}"` : '',
    '',
    'Task: give one specific, non-judgemental observation that connects the measured visual features to the patient\'s own words, then one concrete 5-minute therapeutic exercise.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** True when AIEngine returned its hard-coded fallback instead of real output. */
export function isAiFallback(analysis) {
  return !analysis || typeof analysis.insight !== 'string' || analysis.insight.toLowerCase().includes(AI_FALLBACK_MARKER);
}

/* ------------------------------------------------------------------ */
/* Session summary / export helpers                                    */
/* ------------------------------------------------------------------ */

export function buildSessionSummary(session) {
  const f = session.features;
  const a = session.affect;
  const lines = [
    `Art therapy session — ${new Date(session.at).toLocaleString()}`,
    `Guided prompt: ${session.prompt || 'free expression'}`,
    `Self-report before: mood ${session.mood}/5, energy ${session.energy}/5`,
    '',
    'Measured artwork properties',
    `  palette: ${f.palette.map((p) => `${p.hex} ${p.share}%`).join(', ')}`,
    `  colourfulness ${f.colorfulness}/100 | brightness ${f.brightness}/100 | saturation ${f.saturation}/100`,
    `  warm ${f.warmRatio}% | cool ${f.coolRatio}% | dark ${f.darkRatio}%`,
    `  coverage ${f.coverage}% | detail ${f.detailBand} | symmetry ${f.symmetry}/100`,
    `  colour relationship: ${session.harmony.type}`,
    '',
    `Affect estimate: valence ${a.valence}/100, arousal ${a.arousal}/100 (${a.label}), confidence ${a.confidence}%`,
    `Narrative source: ${session.source === 'ai' ? 'AI-assisted' : 'local rule engine'}`,
    '',
    `Observation: ${session.insight}`,
    `Suggested exercise: ${session.recommendation}`,
    '',
    'This is a screening aid for expressive-art sessions. It is not a diagnosis and does not replace a therapist.',
  ];
  return lines.join('\n');
}

export function artworkThumbnail(canvas, maxSize = 240) {
  if (!canvas) return null;
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  const thumb = document.createElement('canvas');
  thumb.width = Math.max(1, Math.round(canvas.width * scale));
  thumb.height = Math.max(1, Math.round(canvas.height * scale));
  thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
  try {
    return thumb.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

export function artworkDataUrl(canvas) {
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function downloadDataUrl(dataUrl, filename) {
  if (!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
