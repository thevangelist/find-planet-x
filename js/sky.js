'use strict';
// Photographic plates. A plate is 356 x 432 mm (14 x 17 in); the 13-inch astrograph gives ~123"/mm,
// so one plate covers ~12.2 x 14.7 degrees. We render at PX_PER_MM pixels per millimetre.
const Sky = (() => {
  const PLATE_W_MM = 432, PLATE_H_MM = 356, PX_PER_MM = 7, ARCSEC_PER_MM = 123;
  const W = PLATE_W_MM * PX_PER_MM, H = PLATE_H_MM * PX_PER_MM;

  // real stars near delta Geminorum (RA deg, Dec deg, V mag). Faint ones are statistical.
  const GEM_STARS = [
    [110.03, 21.98, 3.53, 'δ Gem'], [106.03, 20.57, 3.9, 'ζ Gem'], [110.30, 16.54, 3.58, 'λ Gem'],
    [111.43, 27.80, 3.79, 'ι Gem'], [113.98, 26.90, 4.06, 'υ Gem'], [116.11, 24.40, 3.57, 'κ Gem'],
    [116.33, 28.03, 1.14, 'β Gem'], [105.60, 24.22, 5.18, 'ω Gem'], [108.80, 24.9, 5.6, '56 Gem'],
    [111.0, 20.0, 5.1, '63 Gem'], [107.6, 16.4, 5.0, '51 Gem'], [112.3, 22.5, 5.9, '65 Gem'],
    [104.6, 19.4, 5.3, '38 Gem'], [113.3, 25.4, 5.9, '70 Gem'], [109.2, 18.5, 6.2, ''], [107.0, 23.6, 6.0, ''],
  ];
  // Pluto on the discovery plates: ~RA 7h15.6m, Dec +22°05', moving retrograde ~1.2'/day
  const PLUTO = { ra: 108.90, dec: 22.08, dRaDay: -0.0205, dDecDay: 0.0012, mag: 15.0 };

  // ra h, dec deg, major and minor size in arcmin, position angle, type, strength
  const DSO = [
    [0.712, 41.27, 178, 63, 35, 'gal', 1.0, 'M31'], [1.564, 30.66, 70, 40, 23, 'gal', 0.45, 'M33'], [5.588, -5.39, 65, 60, 0, 'neb', 1.0, 'M42'],
    [3.79, 24.12, 110, 110, 0, 'open', 1.0, 'M45'], [4.47, 15.87, 330, 330, 0, 'open', 0.5, 'Hyades'], [8.67, 19.98, 95, 95, 0, 'open', 0.8, 'M44'],
    [8.85, 11.81, 30, 30, 0, 'open', 0.6, 'M67'], [6.15, 24.33, 28, 28, 0, 'open', 0.8, 'M35'], [5.575, 22.01, 6, 4, 60, 'neb', 0.5, 'M1'],
    [7.70, -14.82, 27, 27, 0, 'open', 0.6, 'M46'], [7.61, -14.49, 30, 30, 0, 'open', 0.7, 'M47'], [8.23, -5.75, 54, 54, 0, 'open', 0.5, 'M48'],
    [18.06, -24.38, 90, 40, 90, 'neb', 0.9, 'M8'], [18.04, -23.03, 28, 28, 0, 'neb', 0.6, 'M20'], [18.61, -23.9, 32, 32, 0, 'glob', 0.9, 'M22'],
    [18.85, -6.27, 14, 14, 0, 'open', 0.8, 'M11'], [17.90, -34.8, 80, 80, 0, 'open', 0.7, 'M7'], [17.67, -32.25, 25, 25, 0, 'open', 0.6, 'M6'],
    [18.31, -13.8, 35, 35, 0, 'neb', 0.6, 'M16'], [18.34, -16.18, 46, 37, 0, 'neb', 0.7, 'M17'], [16.69, 36.46, 20, 20, 0, 'glob', 0.8, 'M13'],
    [16.39, -26.53, 26, 26, 0, 'glob', 0.7, 'M4'], [19.99, 22.72, 8, 6, 0, 'neb', 0.4, 'M27'], [12.67, -11.62, 9, 4, 45, 'gal', 0.5, 'M104'],
    [11.31, 13.1, 10, 3, 174, 'gal', 0.35, 'M65'], [11.34, 12.99, 9, 4, 173, 'gal', 0.35, 'M66'], [12.44, 12.72, 7, 6, 0, 'gal', 0.4, 'M49'],
    [12.52, 12.39, 8, 7, 0, 'gal', 0.4, 'M87'], [12.61, 12.55, 7, 5, 0, 'gal', 0.3, 'M86'], [5.87, 32.55, 24, 24, 0, 'open', 0.6, 'M37'],
    [5.47, 35.85, 21, 21, 0, 'open', 0.6, 'M38'], [5.60, 34.14, 12, 12, 0, 'open', 0.5, 'M36'], [21.50, 12.17, 18, 18, 0, 'glob', 0.6, 'M15'],
    [21.56, -0.82, 16, 16, 0, 'glob', 0.5, 'M2'], [13.70, 28.38, 23, 23, 0, 'glob', 0.7, 'M3'], [15.31, 2.08, 23, 23, 0, 'glob', 0.7, 'M5'],
  ];
  function drawDSO(g, p, o, r, soft) {
    const mmPerArcmin = 60 / ARCSEC_PER_MM, ax = o[2] * mmPerArcmin * PX_PER_MM / 2, ay = o[3] * mmPerArcmin * PX_PER_MM / 2, pa = o[4] * Math.PI / 180, k = o[6];
    g.save(); g.translate(p.x, p.y); g.rotate(pa);
    if (o[5] === 'gal' || o[5] === 'neb') {
      const n = o[5] === 'neb' ? 6 : 1;
      for (let i = 0; i < n; i++) { const ox = n > 1 ? (r() - .5) * ax * 0.9 : 0, oy = n > 1 ? (r() - .5) * ay * 0.9 : 0, sx = n > 1 ? ax * (0.35 + r() * 0.5) : ax, sy = n > 1 ? ay * (0.35 + r() * 0.5) : ay;
        g.save(); g.translate(ox, oy); g.scale(1, sy / sx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, sx);
        const tc = o[5] === 'neb' ? [221, 208, 206] : [210, 212, 216];
        gr.addColorStop(0, `rgba(${tc[0]},${tc[1]},${tc[2]},${(o[5] === 'gal' ? 0.55 : 0.32) * k})`); gr.addColorStop(0.35, `rgba(${tc[0] - 10},${tc[1] - 10},${tc[2] - 10},${0.18 * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, sx, 0, 7); g.fill(); g.restore(); }
      if (o[5] === 'gal') { const gr = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(3, ax * 0.12)); gr.addColorStop(0, `rgba(230,228,222,${0.9 * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, Math.max(3, ax * 0.12), 0, 7); g.fill(); }
    } else { // clusters: a crowd of stars, globulars with a glowing core
      const n = o[5] === 'glob' ? 900 : Math.round(60 + ax * ay / 60);
      if (o[5] === 'glob') { const gr = g.createRadialGradient(0, 0, 0, 0, 0, ax * 0.6); gr.addColorStop(0, `rgba(225,222,215,${0.8 * k})`); gr.addColorStop(0.3, `rgba(215,212,205,${0.3 * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ax * 0.6, 0, 7); g.fill(); }
      for (let i = 0; i < n; i++) { const d = o[5] === 'glob' ? Math.abs(gauss(r)) * ax * 0.45 : Math.sqrt(r()) * ax, ang = r() * Math.PI * 2;
        const mag = o[5] === 'glob' ? 13.5 + r() * 3.5 : 9 + r() * 7.5 - k * 1.5; const sp = sprite(mag + soft); g.drawImage(sp.c, Math.cos(ang) * d - sp.size / 2, Math.sin(ang) * d * (ay / ax) - sp.size / 2); } }
    g.restore();
  }
  function project(center, ra, dec) {
    // gnomonic-ish small-field: x east->west increases leftwards on a sky photo; keep east to the left
    const dra = (ra - center.ra) * Math.cos(center.dec * Math.PI / 180), ddec = dec - center.dec;
    return { mm: { x: -dra * 3600 / ARCSEC_PER_MM, y: -ddec * 3600 / ARCSEC_PER_MM } };
  }
  const mmToPx = mm => ({ x: (mm.x + PLATE_W_MM / 2) * PX_PER_MM, y: (mm.y + PLATE_H_MM / 2) * PX_PER_MM });

  // star sprite cache per magnitude bucket
  const sprites = {};
  function sprite(mag) {
    const k = Math.round(mag * 2) / 2; if (sprites[k]) return sprites[k];
    const r = clamp(Math.pow(2, (10.5 - k) / 2.0) * 1.0, 1.25, 46);
    const size = Math.ceil(r * 2 + 4), c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), cx = size / 2;
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, r + 1);
    const core = clamp((17.8 - k) / 5.0, 0.16, 0.82);
    const tint = ((k * 7.3) % 1) - 0.5, wr = Math.round(6 * tint), wb = -Math.round(6 * tint);
    grad.addColorStop(0, `rgba(${222 + wr},219,${210 + wb},${core})`); grad.addColorStop(0.45, `rgba(${212 + wr},208,${200 + wb},${core * 0.6})`); grad.addColorStop(0.8, `rgba(200,197,190,${core * 0.18})`);
    grad.addColorStop(1, 'rgba(220,218,210,0)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    if (k < 6) { g.strokeStyle = `rgba(230,228,220,${0.25 * core})`; g.lineWidth = 1; // diffraction-like spikes from plate holder
      g.beginPath(); g.moveTo(0, cx); g.lineTo(size, cx); g.moveTo(cx, 0); g.lineTo(cx, size); g.stroke(); }
    sprites[k] = { c, size, r }; return sprites[k];
  }

  // movers: asteroids shift 10..45 mm in a few days, Pluto only ~3.3 mm
  function makeMovers(spec, r) {
    const m = [];
    const n = spec.asteroids ?? Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const mag = 14.3 + r() * 2.2, ang = (r() - 0.5) * 0.6 + Math.PI, dist = (8 + r() * 24) * spec.days / 6;
      m.push({ kind: 'asteroid', mag, x: (r() - 0.5) * (PLATE_W_MM - 60), y: (r() - 0.5) * (PLATE_H_MM - 60),
        dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist * 0.4 });
    }
    // once in a while a faint, fast one crosses the field: on two plates it is far apart, easy to miss, a nuisance
    if (r() < 0.05) { const ang = r() * Math.PI * 2, dist = (40 + r() * 30) * spec.days / 6; m.push({ kind: 'asteroid', mag: 15.8 + r() * 0.8, x: (r() - 0.5) * (PLATE_W_MM - 100), y: (r() - 0.5) * (PLATE_H_MM - 100), dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist }); }
    if (spec.pluto) {
      const p0 = project(spec.center, PLUTO.ra, PLUTO.dec).mm;
      const k = (spec.plutoRate ?? 1) * spec.days;
      const p1 = project(spec.center, PLUTO.ra + PLUTO.dRaDay * k, PLUTO.dec + PLUTO.dDecDay * k).mm;
      m.push({ kind: 'pluto', mag: PLUTO.mag, x: p0.x, y: p0.y, dx: p1.x - p0.x, dy: p1.y - p0.y });
    }
    // real discoveries present on these plates
    (spec.finds || []).forEach(f => {
      const fp = project(spec.center, f.ra * 15, f.dec).mm;
      const base = { find: f, kind: f.kind, mag: f.mag, x: fp.x, y: fp.y };
      if (f.kind === 'asteroid') { const ang = (r() - 0.5) * 0.6 + Math.PI, dist = (12 + r() * 25) * spec.days / 6; m.push({ ...base, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist * 0.4 }); }
      else if (f.kind === 'comet') { const ang = (r() - 0.5) * 1.2 + Math.PI * 0.8, dist = (20 + r() * 20) * spec.days / 6; m.push({ ...base, dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist, tail: ang + Math.PI }); }
      else if (f.kind === 'variable') m.push({ ...base, dx: 0, dy: 0, magB: f.mag - 3 });
    });
    // plate defects: dust/emulsion flaws, present on only one plate
    const nd = 2 + Math.floor(r() * 3);
    for (let i = 0; i < nd; i++) m.push({ kind: 'defect', mag: 13 + r() * 3, x: (r() - 0.5) * PLATE_W_MM * .95, y: (r() - 0.5) * PLATE_H_MM * .95, plate: r() < .5 ? 0 : 1 });
    return m;
  }

  // Build a plate pair: returns { a, b, movers, spec } where a,b are canvases
  function buildPair(spec) {
    const r = rng(hashStr(spec.seed));
    const nStars = Math.round((spec.density ?? 1) * 30000 * (spec.haze ? 0.72 : 1)), hz = spec.haze ? 0.7 : 0;
    const stars = new Float32Array(nStars * 3);
    for (let i = 0; i < nStars; i++) {
      // log N(m) ~ 0.4m; shape a distribution peaking at faint mags, limit ~17
      let mag = 17.2 - hz - Math.pow(r(), 0.42) * 9.5;
      stars[i * 3] = r() * W; stars[i * 3 + 1] = r() * H; stars[i * 3 + 2] = mag;
    }
    const inPlate = mm => Math.abs(mm.x) < PLATE_W_MM / 2 && Math.abs(mm.y) < PLATE_H_MM / 2;
    const named = BRIGHT_STARS.map(s => ({ mm: project(spec.center, s[0] * 15, s[1]).mm, mag: s[2] })).concat(GEM_STARS.filter(s => s[2] > 5.2).map(s => ({ mm: project(spec.center, s[0], s[1]).mm, mag: s[2] })))
      .filter(s => inPlate(s.mm)).map(s => ({ ...mmToPx(s.mm), mag: s.mag }));
    const movers = makeMovers(spec, r);
    const plates = [0, 1].map(idx => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#15171a'; g.fillRect(0, 0, W, H);
      const fogged = spec.fog && spec.fog[idx] === 'fogged';
      if (fogged) { g.fillStyle = 'rgba(120,118,110,.45)'; g.fillRect(0, 0, W, H); }
      const rr = rng(hashStr(spec.seed + 'em' + idx));
      // broad density variation (a 6 x 6 field of soft patches, like a flat-field residual) and one edge that developed darker
      for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 6; gx++) { const x = (gx + 0.5) * W / 6 + (rr() - 0.5) * 200, y = (gy + 0.5) * H / 6 + (rr() - 0.5) * 200, v = (rr() - 0.5) * 0.05;
        const gr = g.createRadialGradient(x, y, 0, x, y, 520); gr.addColorStop(0, v > 0 ? `rgba(255,250,235,${v})` : `rgba(0,0,0,${-v})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 520, y - 520, 1040, 1040); }
      { const side = Math.floor(rr() * 4), eg = side === 0 ? g.createLinearGradient(0, 0, 380, 0) : side === 1 ? g.createLinearGradient(W, 0, W - 380, 0) : side === 2 ? g.createLinearGradient(0, 0, 0, 380) : g.createLinearGradient(0, H, 0, H - 380);
        eg.addColorStop(0, `rgba(0,0,0,${0.08 + rr() * 0.1})`); eg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = eg; g.fillRect(0, 0, W, H); }
      // uneven emulsion sensitivity: faint mottling
      for (let i = 0; i < 70; i++) { const x = rr() * W, y = rr() * H, rad = 150 + rr() * 500;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(255,250,235,${rr() * 0.025})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      // slight registration offset + per-plate seeing (second plate a hair softer)
      const off = { x: 0, y: 0 };   // the comparator stage is registered: stars do not jump between plates
      const soft = idx ? 0.25 : 0;
      for (let i = 0; i < nStars; i++) {
        const m = stars[i * 3 + 2] + (idx ? gauss(rr) * 0.08 : 0);
        const s = sprite(m + soft); g.drawImage(s.c, stars[i * 3] + off.x - s.size / 2, stars[i * 3 + 1] + off.y - s.size / 2);
      }
      named.forEach(n => { const s = sprite(n.mag); g.drawImage(s.c, n.x + off.x - s.size / 2, n.y + off.y - s.size / 2);
        if (n.mag < 6.5) { const rad = s.r * (2.2 + (6.5 - n.mag) * 0.35); g.strokeStyle = `rgba(225,222,215,${0.05 + (6.5 - n.mag) * 0.03})`; g.lineWidth = Math.max(1.5, rad * 0.12); g.beginPath(); g.arc(n.x + off.x, n.y + off.y, rad, 0, 7); g.stroke(); } });
      DSO.forEach(o => { const mm = project(spec.center, o[0] * 15, o[1]).mm; if (Math.abs(mm.x) < PLATE_W_MM / 2 + 30 && Math.abs(mm.y) < PLATE_H_MM / 2 + 30) { const p = mmToPx(mm); drawDSO(g, { x: p.x + off.x, y: p.y + off.y }, o, rng(hashStr(spec.seed + o[7])), soft); } });
      movers.forEach(m => {
        if (m.kind === 'defect') { if (m.plate !== idx) return; const p = mmToPx(m); g.fillStyle = 'rgba(210,205,195,.55)'; g.beginPath(); g.ellipse(p.x, p.y, 2.5, 1.2, rr() * 3, 0, 7); g.fill(); return; }
        const p = mmToPx({ x: m.x + (idx ? m.dx : 0), y: m.y + (idx ? m.dy : 0) });
        if (m.kind === 'comet') { // diffuse coma with a short tail
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16); gr.addColorStop(0, 'rgba(230,228,220,.75)'); gr.addColorStop(0.4, 'rgba(220,218,210,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, 16, 0, 7); g.fill();
          const tg = g.createLinearGradient(p.x, p.y, p.x + Math.cos(m.tail) * 60, p.y + Math.sin(m.tail) * 60); tg.addColorStop(0, 'rgba(220,218,210,.35)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
          g.strokeStyle = tg; g.lineWidth = 7; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + Math.cos(m.tail) * 60, p.y + Math.sin(m.tail) * 60); g.stroke(); return; }
        const mag = (m.kind === 'variable' && idx ? m.magB : m.mag) + hz;
        const s = sprite(mag + soft); g.drawImage(s.c, p.x + off.x - s.size / 2, p.y + off.y - s.size / 2);
      });
      // grain
      const img = g.getImageData(0, 0, W, H), d = img.data, gr2 = rng(hashStr(spec.seed + 'g' + idx));
      // faint row banding, as the developer dragged across the plate in the tray
      const rowOff = new Float32Array(H); for (let y = 0; y < H; y++) rowOff[y] = (gr2() - 0.5) * 3 + (y % 7 === 0 ? (gr2() - 0.5) * 4 : 0);
      for (let y = 0; y < H; y++) { const ro = rowOff[y]; for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, n = (gr2() - 0.5) * 14 + ro; d[i] += n; d[i + 1] += n; d[i + 2] += n; } }
      // clumpy grain on top of the fine grain
      for (let k = 0; k < 30000; k++) { const x = Math.floor(gr2() * (W - 1)), y = Math.floor(gr2() * (H - 1)), n = (gr2() - 0.5) * 9; [0, 1, W, W + 1].forEach(o => { const i = ((y * W + x) + o) * 4; d[i] += n; d[i + 1] += n; d[i + 2] += n; }); }
      // emulsion pinholes and dust: single bright points and small dark specks
      for (let k = 0; k < 140; k++) { const i = (Math.floor(gr2() * H) * W + Math.floor(gr2() * W)) * 4; d[i] = d[i + 1] = d[i + 2] = 200 + gr2() * 55; }
      for (let k = 0; k < 400; k++) { const x = Math.floor(gr2() * (W - 2)), y = Math.floor(gr2() * (H - 2)); [0, 1, W].forEach(o => { const i = ((y * W + x) + o) * 4; d[i] *= 0.5; d[i + 1] *= 0.5; d[i + 2] *= 0.5; }); }
      g.putImageData(img, 0, 0);
      // once in a while something crossed the field during the hour: a meteor or a fast asteroid leaves a trail on one plate
      if (gr2() < 0.04) { const x0 = gr2() * W, y0 = gr2() * H, ang = gr2() * Math.PI * 2, len = 60 + gr2() * 260; const lg = g.createLinearGradient(x0, y0, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
        lg.addColorStop(0, 'rgba(230,228,220,0)'); lg.addColorStop(0.3, 'rgba(230,228,220,.55)'); lg.addColorStop(0.7, 'rgba(230,228,220,.4)'); lg.addColorStop(1, 'rgba(230,228,220,0)');
        g.strokeStyle = lg; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); g.stroke(); }
      // vignetting and a scratch
      const v = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
      if (rr() < 0.6) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.beginPath(); const x0 = rr() * W, y0 = rr() * H; g.moveTo(x0, y0); g.lineTo(x0 + (rr() - .5) * 600, y0 + (rr() - .5) * 600); g.stroke(); }
      return c;
    });
    return { a: plates[0], b: plates[1], movers, spec, W, H };
  }

  return { buildPair, PLATE_W_MM, PLATE_H_MM, PX_PER_MM, W, H, mmToPx, PLUTO };
})();
