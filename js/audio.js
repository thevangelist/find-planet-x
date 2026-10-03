'use strict';
// Audio manager: file assets in assets/audio/<name>.(ogg|mp3|wav); procedural fallbacks for a few sounds.
const Audio_ = (() => {
  let ctx, master, muted = !!Prefs.get('muted'), started = false;
  const buffers = {}, missing = new Set(), loops = {}, fx = {};
  const EXT = ['ogg', 'mp3', 'wav'];
  const SYNTH_BEDS = ['wind', 'drone', 'amb_search', 'amb_dome', 'safelight', 'clock'];

  async function fetchBuffer(name) {
    for (const ext of EXT) {
      try {
        const r = await fetch(`assets/audio/${name}.${ext}`);
        if (!r.ok) continue;
        const ab = await r.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      } catch (e) { /* try next ext */ }
    }
    return null;
  }
  async function load(name) {
    if (buffers[name] || missing.has(name)) return buffers[name];
    const b = await fetchBuffer(name);
    if (b) buffers[name] = b; else missing.add(name);
    return b;
  }
  function init() {
    if (started) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ctx.destination);
    started = true;
    buildSynths();
  }
  function toggleMute() {
    muted = !muted; Prefs.set('muted', muted); if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
    toast(muted ? 'Sound off' : 'Sound on', 1200);
  }

  // ---- procedural sources ----
  function noiseBuffer(sec = 2, brown = false) {
    const n = ctx.sampleRate * sec, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    // crossfade the tail into the head so the loop point is seamless
    const X = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < X; i++) { const t = i / X; d[n - X + i] = d[n - X + i] * (1 - t) + d[i] * t; }
    return b;
  }
  let noiseW, noiseB;
  function buildSynths() { noiseW = noiseBuffer(2); noiseB = noiseBuffer(4, true); }

  // short click: comparator shutter / telescope slow-motion
  function click(vol = 0.25, pitch = 1800, len = 0.03) {
    if (!started) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseW;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = pitch; bp.Q.value = 2.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(bp).connect(g).connect(master); src.start(t); src.stop(t + len + 0.02);
    const o = ctx.createOscillator(); o.frequency.value = pitch * 0.45; const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + len * 0.8);
    o.connect(og).connect(master); o.start(t); o.stop(t + len);
  }
  function tick() { click(0.06, 2600, 0.015); }

  // continuous beds, keyed by name; built lazily
  function synthBed(name) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    const nodes = [g];
    if (name === 'wind') {
      const s = ctx.createBufferSource(); s.buffer = noiseB; s.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 180;
      lfo.connect(lg).connect(lp.frequency); lfo.start();
      const ag = ctx.createGain(); ag.gain.value = 0.6;
      const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.11; const l2g = ctx.createGain(); l2g.gain.value = 0.3;
      lfo2.connect(l2g).connect(ag.gain); lfo2.start();
      s.connect(lp).connect(ag).connect(g); s.start(); nodes.push(s, lfo, lfo2);
    } else if (name === 'drone' || name === 'amb_search' || name === 'amb_dome') {
      const base = name === 'amb_dome' ? 41.2 : 55;
      [[base, 0.5], [base * 1.005, 0.4], [base * 2, 0.18], [base * 3.01, 0.06]].forEach(([f, v]) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = v; o.connect(og).connect(g); o.start(); nodes.push(o);
      });
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lg = ctx.createGain(); lg.gain.value = 0.04;
      lfo.connect(lg).connect(g.gain); lfo.start(); nodes.push(lfo);
    } else if (name === 'safelight') {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
      const og = ctx.createGain(); og.gain.value = 0.08; o.connect(lp).connect(og).connect(g); o.start(); nodes.push(o);
    } else if (name === 'clock') {
      const iv = setInterval(() => { if (g.gain.value > 0.01) tick(); }, 1000);
      nodes.push({ stop: () => clearInterval(iv) });
    } else return null;
    return { gain: g, nodes, synth: true };
  }

  // crossfade loop: overlapping sources with gain ramps, so file edges never click
  function fileLoop(buf, name) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    const fade = Math.min(1.5, buf.duration / 4), period = buf.duration - fade;
    let next = ctx.currentTime + 0.05, timer;
    const spawn = () => {
      const s = ctx.createBufferSource(); s.buffer = buf; const sg = ctx.createGain();
      sg.gain.setValueAtTime(0, next); sg.gain.linearRampToValueAtTime(1, next + fade);
      sg.gain.setValueAtTime(1, next + period); sg.gain.linearRampToValueAtTime(0, next + buf.duration);
      s.connect(sg).connect(g); s.start(next); s.stop(next + buf.duration + 0.05);
      next += period;
    };
    spawn();
    timer = setInterval(() => { if (next - ctx.currentTime < fade + 0.5) spawn(); }, 250);
    return { gain: g, nodes: [g, { stop: () => clearInterval(timer) }], synth: false };
  }

  // ambience / loops with fade. vol 0..1. A stop() that arrives while the file is still decoding cancels the start.
  const pending = {};
  let music = Prefs.get('music') !== false;
  const isMusic = n => n.startsWith('amb_');
  function setMusic(on) { music = on; if (!on) Object.keys(loops).filter(isMusic).forEach(n => stop(n, 1)); }
  async function loop(name, vol = 0.3, fade = 3) {
    if (!started || (!music && isMusic(name))) return;
    const target = vol * (buffers[name] || !SYNTH_BEDS.includes(name) ? 1 : 0.5);
    if (loops[name]) { loops[name].gain.gain.cancelScheduledValues(ctx.currentTime); loops[name].gain.gain.setTargetAtTime(target, ctx.currentTime, fade / 3); return; }
    const token = Symbol(); pending[name] = token;
    const buf = await load(name);
    if (pending[name] !== token) return;
    delete pending[name];
    const L = buf ? fileLoop(buf, name) : synthBed(name);
    if (!L) return;
    loops[name] = L;
    const t = ctx.currentTime; L.gain.gain.setValueAtTime(0, t); L.gain.gain.linearRampToValueAtTime(vol * (L.synth ? 0.5 : 1), t + fade);
  }
  function stop(name, fade = 2.5) {
    delete pending[name];
    const L = loops[name]; if (!L) return;
    delete loops[name];
    const t = ctx.currentTime, g = L.gain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => L.nodes.forEach(n => { try { n.stop && n.stop(); n.disconnect && n.disconnect(); } catch (e) {} }), fade * 1000 + 300);
  }
  function stopAll(fade = 2.5) { Object.keys(loops).forEach(n => stop(n, fade)); }
  function stopAllExcept(keep, fade = 2.5) { Object.keys(loops).forEach(n => { if (!keep.includes(n)) stop(n, fade); }); }

  // one-shot effect; variants as name_1 name_2 ... are tried first
  async function play(name, vol = 0.6, variants = 1) {
    if (!started) return;
    let buf = null;
    if (variants > 1) buf = await load(`${name}_${1 + Math.floor(Math.random() * variants)}`);
    if (!buf) buf = await load(name);
    if (!buf) { fallbackFx(name, vol); return; }
    const s = ctx.createBufferSource(); s.buffer = buf; const g = ctx.createGain(), t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.setValueAtTime(vol, t + buf.duration - 0.05); g.gain.linearRampToValueAtTime(0, t + buf.duration);
    s.connect(g).connect(master); s.start(t);
  }
  function fallbackFx(name, vol) {
    if (name === 'telescope_click' || name === 'comparator_click') click(vol * 0.4, 1400, 0.04);
    else if (name === 'glass_plate_set') { click(vol * 0.5, 3200, 0.08); setTimeout(() => click(vol * 0.3, 900, 0.12), 90); }
    else if (name === 'pencil_write') { let i = 0; const iv = setInterval(() => { click(0.04, 4000 + Math.random() * 2000, 0.02); if (++i > 18) clearInterval(iv); }, 90); }
    else if (name === 'chair_creak' || name === 'wood_floor_creak' || name === 'door_creak') click(vol * 0.3, 300 + Math.random() * 200, 0.25);
    else if (name === 'page_turn') click(vol * 0.3, 2200, 0.12);
    // everything else stays silent until the file arrives
  }

  // discovery swell, synth-only (per spec the file may be absent)
  function swell(seconds = 60) {
    if (!started) return;
    const t = ctx.currentTime, g = ctx.createGain(); g.gain.value = 0; g.connect(master);
    [55, 82.4, 110, 164.8, 220, 277.2].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle'; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime([0.4, 0.3, 0.2, 0.1, 0.07, 0.05][i], t + 8 + i * 7);
      o.connect(og).connect(g); o.start(t); o.stop(t + seconds + 10);
    });
    g.gain.linearRampToValueAtTime(0.35, t + 6); g.gain.setValueAtTime(0.35, t + seconds - 10); g.gain.linearRampToValueAtTime(0, t + seconds);
  }

  function preload(names) { if (started) names.forEach(load); }
  document.addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) toggleMute(); });
  return { init, play, loop, stop, stopAll, stopAllExcept, click, tick, swell, preload, toggleMute, setMusic, get started() { return started; } };
})();
