/* DSP del Taller PSR-E360: YIN (pitch), cromagrama + plantillas de acordes,
   detector de ataques, seguidor de notas y centroide espectral. Sin dependencias. */
const DSP = (() => {
  const NOTE = ['Do','Do#','Re','Re#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si'];
  const EN = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const pc = m => ((Math.round(m) % 12) + 12) % 12;
  const freqToMidi = (f, a4 = 440) => 69 + 12 * Math.log2(f / a4);
  const midiToFreq = (m, a4 = 440) => a4 * 2 ** ((m - 69) / 12);
  const midiName = m => NOTE[pc(m)] + (Math.floor(m / 12) - 1);

  // YIN (de Cheveigné & Kawahara, 2002)
  function yin(buf, sr, o = {}) {
    const fmin = o.fmin || 60, fmax = o.fmax || 2100, thr = o.threshold || 0.12;
    let rms = 0;
    for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / buf.length);
    const tauMax = Math.min(Math.floor(sr / fmin), Math.floor(buf.length / 2));
    const tauMin = Math.max(2, Math.floor(sr / fmax));
    const W = buf.length - tauMax;
    const c = new Float32Array(tauMax + 2);
    c[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let j = 0; j < W; j++) { const x = buf[j] - buf[j + tau]; s += x * x; }
      run += s;
      c[tau] = run > 0 ? s * tau / run : 1;
    }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (c[t] < thr) { while (t + 1 <= tauMax && c[t + 1] < c[t]) t++; tau = t; break; }
    }
    if (tau < 0) {
      let mv = 1e9;
      for (let t = tauMin; t <= tauMax; t++) if (c[t] < mv) { mv = c[t]; tau = t; }
      if (mv > 0.3) return { freq: -1, conf: 0, rms };
    }
    let better = tau;
    if (tau > tauMin && tau < tauMax) {
      const a = c[tau - 1], b = c[tau], e = c[tau + 1], den = a + e - 2 * b;
      if (den) better = tau + (a - e) / (2 * den);
    }
    return { freq: sr / better, conf: 1 - c[tau], rms };
  }

  // Mapa bin FFT -> clase de altura
  function makeChromaMap(bins, sr, fftSize, fmin = 60, fmax = 2100) {
    const map = new Int8Array(bins).fill(-1), w = new Float32Array(bins);
    for (let k = 1; k < bins; k++) {
      const f = k * sr / fftSize;
      if (f < fmin || f > fmax) continue;
      const m = freqToMidi(f), r = Math.round(m), dev = Math.abs(m - r);
      if (dev > 0.4) continue;
      map[k] = pc(r); w[k] = 1 - dev;
    }
    return { map, w };
  }
  // db: Float32Array en dB (como AnalyserNode.getFloatFrequencyData)
  function chroma(db, cm) {
    const ch = new Float32Array(12);
    for (let k = 1; k < db.length - 1; k++) {
      const p = cm.map[k];
      if (p < 0 || db[k] < db[k - 1] || db[k] < db[k + 1]) continue; // solo picos
      ch[p] += 10 ** (db[k] / 20) * cm.w[k];
    }
    let mx = 0;
    for (const v of ch) mx = Math.max(mx, v);
    if (mx > 0) for (let i = 0; i < 12; i++) ch[i] /= mx;
    return ch;
  }
  function centroid(db, sr, fftSize, fmin = 80, fmax = 8000) {
    let num = 0, den = 0;
    for (let k = 1; k < db.length; k++) {
      const f = k * sr / fftSize;
      if (f < fmin) continue; if (f > fmax) break;
      const m = 10 ** (db[k] / 20); num += f * m; den += m;
    }
    return den ? num / den : 0;
  }

  // Acordes
  const QUAL = { '': [0,4,7], 'm': [0,3,7], '7': [0,4,7,10], 'maj7': [0,4,7,11], 'm7': [0,3,7,10],
    'sus2': [0,2,7], 'sus4': [0,5,7], 'add9': [0,2,4,7], 'dim': [0,3,6], '5': [0,7] };
  const QNAME = { '': 'mayor', 'm': 'menor', '7': 'séptima', 'maj7': 'séptima mayor', 'm7': 'menor séptima',
    'sus2': 'sus2', 'sus4': 'sus4', 'add9': 'add9', 'dim': 'disminuido', '5': 'quinta' };
  function parseChord(name) {
    const m = /^([A-G])(#|b)?(.*)$/.exec(name);
    if (!m) throw new Error('acorde inválido ' + name);
    let root = EN.indexOf(m[1]) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    root = (root + 12) % 12;
    if (!(m[3] in QUAL)) throw new Error('calidad desconocida ' + name);
    return { root, q: m[3] };
  }
  const chordPcs = name => { const { root, q } = parseChord(name); return QUAL[q].map(i => (root + i) % 12); };
  const chordLabel = name => { const { root, q } = parseChord(name); return NOTE[root] + ' ' + QNAME[q]; };
  function template(root, q) {
    const t = new Float32Array(12);
    QUAL[q].forEach((i, k) => { t[(root + i) % 12] = k === 0 ? 1.15 : 1; });
    return t;
  }
  function corr(a, b) {
    let ma = 0, mb = 0;
    for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; }
    ma /= 12; mb /= 12;
    let n = 0, da = 0, dbb = 0;
    for (let i = 0; i < 12; i++) { const x = a[i] - ma, y = b[i] - mb; n += x * y; da += x * x; dbb += y * y; }
    return da && dbb ? n / Math.sqrt(da * dbb) : 0;
  }
  function matchChord(ch, target, minScore = 0.5) {
    const { root, q } = parseChord(target);
    const score = corr(ch, template(root, q));
    let rival = -1, rivalName = '';
    const quals = new Set(['', 'm', q]);
    for (let r = 0; r < 12; r++) for (const qq of quals) {
      if (r === root && qq === q) continue;
      if (r === root && QUAL[qq].every(i => QUAL[q].includes(i)) ) continue; // subconjunto del objetivo (p.ej. C dentro de Cmaj7)
      const s = corr(ch, template(r, qq));
      if (s > rival) { rival = s; rivalName = EN[r] + qq; }
    }
    // Cada nota del acorde debe estar presente (evita que C valide como Cmaj7)
    const tones = QUAL[q].filter(i => i !== 7 || q === '5').map(i => ch[(root + i) % 12]); // la quinta se puede omitir
    const weakest = Math.min(...tones);
    const ok = score >= minScore && score >= rival - 0.02 && weakest >= 0.3;
    return { score, rival, rivalName, weakest, ok };
  }

  // Detector de ataques por salto de energía
  class OnsetDetector {
    constructor() { this.prev = 0; this.last = -1; }
    push(rms, t, floor = 0.015) {
      const on = rms > floor && rms - this.prev > Math.max(floor * 0.8, this.prev * 0.45) && t - this.last > 0.12;
      if (on) this.last = t;
      this.prev = rms;
      return on;
    }
  }
  // Convierte el pitch por cuadro en eventos de nota
  class NoteTracker {
    constructor(need = 3) { this.need = need; this.cand = -1; this.cnt = 0; this.emitted = -1; this.fresh = false; this.silent = 0; }
    update(midi, onset) {
      if (onset) this.fresh = true;
      if (midi < 0) { this.cand = -1; this.cnt = 0; if (++this.silent > 4) this.emitted = -1; return null; }
      this.silent = 0;
      if (midi === this.cand) this.cnt++; else { this.cand = midi; this.cnt = 1; }
      if (this.cnt >= this.need && (midi !== this.emitted || this.fresh)) { this.emitted = midi; this.fresh = false; return midi; }
      return null;
    }
  }
  // Evaluación de pulso por intervalos entre ataques (inmune a la latencia)
  function rhythmScore(onsets, bpm, beats) {
    const P = 60 / bpm, ioi = [];
    for (let i = 1; i < onsets.length; i++) {
      const d = onsets[i] - onsets[i - 1];
      if (d > P * 0.5 && d < P * 1.5) ioi.push(d - P);
    }
    const hits = Math.min(beats, ioi.length + (ioi.length ? 1 : 0));
    const meanAbs = ioi.length ? ioi.reduce((s, x) => s + Math.abs(x), 0) / ioi.length : 1;
    const mean = ioi.length ? ioi.reduce((s, x) => s + x, 0) / ioi.length : 0;
    const cover = Math.min(1, hits / beats);
    const score = Math.round(Math.max(0, cover * (1 - Math.min(1, meanAbs / 0.15))) * 100);
    return { hits, meanAbsMs: Math.round(meanAbs * 1000), driftMs: Math.round(mean * 1000), score, ok: cover >= 0.8 && meanAbs < 0.07 };
  }

  return { NOTE, EN, pc, freqToMidi, midiToFreq, midiName, yin, makeChromaMap, chroma, centroid,
    QUAL, parseChord, chordPcs, chordLabel, matchChord, corr, OnsetDetector, NoteTracker, rhythmScore };
})();
if (typeof module !== 'undefined') module.exports = DSP;
