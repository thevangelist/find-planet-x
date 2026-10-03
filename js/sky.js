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
  const PLUTO = { ra: 108.90, dec: 22.08, dRaDay: -0.0205, dDecDay: 0.0012, mag: 15.2 };

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
    const r = clamp(Math.pow(2, (10.5 - k) / 2.0) * 1.0, 0.9, 46);
    const size = Math.ceil(r * 2 + 4), c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), cx = size / 2;
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, r + 1);
    const core = clamp((18.2 - k) / 4.5, 0.2, 1);
    grad.addColorStop(0, `rgba(245,243,238,${core})`); grad.addColorStop(0.55, `rgba(235,232,225,${core * 0.8})`); grad.addColorStop(0.8, `rgba(225,222,215,${core * 0.25})`);
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
      g.fillStyle = '#0a0b0d'; g.fillRect(0, 0, W, H);
      // uneven emulsion sensitivity: faint mottling
      const rr = rng(hashStr(spec.seed + 'em' + idx));
      for (let i = 0; i < 70; i++) { const x = rr() * W, y = rr() * H, rad = 150 + rr() * 500;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(255,250,235,${rr() * 0.025})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
      // slight registration offset + per-plate seeing (second plate a hair softer)
      const off = idx ? { x: 1.5, y: -1 } : { x: 0, y: 0 };
      const soft = idx ? 0.25 : 0;
      for (let i = 0; i < nStars; i++) {
        const m = stars[i * 3 + 2] + (idx ? gauss(rr) * 0.08 : 0);
        const s = sprite(m + soft); g.drawImage(s.c, stars[i * 3] + off.x - s.size / 2, stars[i * 3 + 1] + off.y - s.size / 2);
      }
      named.forEach(n => { const s = sprite(n.mag); g.drawImage(s.c, n.x + off.x - s.size / 2, n.y + off.y - s.size / 2); });
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
      for (let i = 0; i < d.length; i += 4) { const n = (gr2() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      g.putImageData(img, 0, 0);
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
