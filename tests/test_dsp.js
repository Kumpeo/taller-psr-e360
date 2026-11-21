const DSP = require('../src/dsp.js');
const sr = 48000;
function tone(midis, n, t0 = 0.05, noise = 0.01) {
  const b = new Float32Array(n);
  for (const m of midis) {
    const f = DSP.midiToFreq(m);
    for (let h = 1; h <= 8; h++) {
      const amp = 0.3 / (h ** 1.3) * (h === 1 ? 0.6 : 1); // fundamental débil, típico de piano grave
      const fh = f * h * Math.sqrt(1 + 0.0004 * h * h); // inarmonicidad
      for (let i = 0; i < n; i++) b[i] += amp * Math.sin(2 * Math.PI * fh * (i / sr + t0)) * Math.exp(-(i / sr + t0) * 1.5);
    }
  }
  for (let i = 0; i < n; i++) b[i] += (Math.random() * 2 - 1) * noise;
  return b;
}
function fftDb(x) { // como AnalyserNode: Blackman, |X|/N en dB
  const N = x.length, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) { const a = 0.16, w = (1 - a) / 2 - 0.5 * Math.cos(2 * Math.PI * i / N) + a / 2 * Math.cos(4 * Math.PI * i / N); re[i] = x[i] * w; }
  for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) { const ang = -2 * Math.PI / len; for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const cr = Math.cos(ang * k), ci = Math.sin(ang * k); const ur = re[i + k], ui = im[i + k]; const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; } }
  const db = new Float32Array(N / 2); for (let k = 0; k < N / 2; k++) db[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) / N + 1e-12); return db;
}
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } };
// Pitch
for (const m of [48, 52, 57, 60, 64, 67, 71, 72, 76, 79, 84]) {
  const r = DSP.yin(tone([m], 2048), sr);
  const got = Math.round(DSP.freqToMidi(r.freq));
  ok(got === m && r.conf > 0.85, `yin ${DSP.midiName(m)} -> ${got} conf ${r.conf.toFixed(2)}`);
}
ok(DSP.yin(new Float32Array(2048).map(() => (Math.random() * 2 - 1) * 0.005), sr).rms < 0.015, 'silencio');
// Acordes
const cm = DSP.makeChromaMap(4096, sr, 8192);
const voicing = { C: [48, 60, 64, 67], F: [53, 60, 65, 69], G: [55, 59, 62, 67], Am: [57, 60, 64, 69], Dm: [50, 62, 65, 69], Em: [52, 59, 64, 67],
  Cmaj7: [48, 64, 67, 71], Am7: [45, 60, 64, 67], Dm7: [50, 60, 65, 69], G7: [43, 59, 65, 67], Cadd9: [48, 55, 62, 64, 67], Fmaj7: [41, 57, 60, 64], Gsus4: [43, 60, 62, 67], Csus2: [48, 55, 62, 67] };
for (const [name, notes] of Object.entries(voicing)) {
  const ch = DSP.chroma(fftDb(tone(notes, 8192)), cm);
  const r = DSP.matchChord(ch, name);
  ok(r.ok, `${name} score ${r.score.toFixed(2)} rival ${r.rivalName} ${r.rival.toFixed(2)}`);
}
// Rechazos: acorde equivocado no debe validar
for (const [played, target] of [['C', 'Am'], ['Am', 'C'], ['F', 'Dm'], ['G', 'Em'], ['C', 'G'], ['Dm', 'F'], ['C', 'Cmaj7'], ['G', 'G7']]) {
  const ch = DSP.chroma(fftDb(tone(voicing[played], 8192)), cm);
  const r = DSP.matchChord(ch, target);
  ok(!r.ok, `rechazo: toqué ${played}, objetivo ${target} score ${r.score.toFixed(2)} rival ${r.rivalName} ${r.rival.toFixed(2)}`);
}
// Seguidor de notas con repetición
const tr = new DSP.NoteTracker(); const ev = [];
const frames = [[64,1],[64,0],[64,0],[64,0],[64,1],[64,0],[64,0],[65,1],[65,0],[65,0],[-1,0],[-1,0],[-1,0],[-1,0],[-1,0],[67,0],[67,0],[67,0]];
for (const [m, o] of frames) { const e = tr.update(m, !!o); if (e != null) ev.push(e); }
ok(JSON.stringify(ev) === '[64,64,65,67]', 'tracker ' + JSON.stringify(ev));
// Ritmo
const P = 1; const on = Array.from({ length: 8 }, (_, i) => i * P + 0.3 + (Math.random() - 0.5) * 0.04);
const rs = DSP.rhythmScore(on, 60, 8); ok(rs.ok && rs.score > 70, 'ritmo bueno ' + JSON.stringify(rs));
const bad = Array.from({ length: 8 }, (_, i) => i * P + (Math.random() - 0.5) * 0.4);
ok(!DSP.rhythmScore(bad, 60, 8).ok, 'ritmo malo');
// Brillo: más armónicos -> centroide mayor
const bright = DSP.centroid(fftDb(tone([60, 64, 67], 8192, 0.05, 0)), sr, 8192);
const mellowSig = tone([60, 64, 67], 8192, 0.05, 0).map((v, i, a) => i ? 0.15 * v + 0.85 * a[i - 1] : v);
ok(DSP.centroid(fftDb(mellowSig), sr, 8192) < bright, 'centroide');
console.log(fails ? `${fails} fallas` : 'TODO OK');
