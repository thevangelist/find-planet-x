'use strict';
// Equatorial chart of the ecliptic band for one night: real bright stars, planets, well-known objects, the Milky Way,
// the horizon for Flagstaff at the chosen hour, and the plate frame following the cursor. Red frames come only
// from labels the player wrote by hand.
const SkyMap = (() => {
  const W = 1100, H = 480, DEC_TOP = 50, DEC_SPAN = 90, EPS = 23.44 * Math.PI / 180, R = Math.PI / 180;
  const X = ra => W * (1 - ((ra % 24) + 24) % 24 / 24), Y = dec => H * (DEC_TOP - dec) / DEC_SPAN;
  const eclRaDec = lonDeg => { const l = lonDeg * R; const dec = Math.asin(Math.sin(EPS) * Math.sin(l)) / R;
    let ra = Math.atan2(Math.cos(EPS) * Math.sin(l), Math.cos(l)) * 12 / Math.PI; if (ra < 0) ra += 24; return { ra, dec }; };
  const galRaDec = (l, b) => { const aG = 192.859 * R, dG = 27.128 * R, lN = 122.932 * R, L = l * R, B = b * R;
    const sd = Math.sin(B) * Math.sin(dG) + Math.cos(B) * Math.cos(dG) * Math.cos(lN - L);
    const da = Math.atan2(Math.cos(B) * Math.sin(lN - L), Math.sin(B) * Math.cos(dG) - Math.cos(B) * Math.sin(dG) * Math.cos(lN - L));
    let ra = (aG + da) * 12 / Math.PI; ra = ((ra % 24) + 24) % 24; return { ra, dec: Math.asin(sd) / R }; };
  const sunLon = t => { const x = new Date(t); const doy = (t - Date.UTC(x.getUTCFullYear(), 0, 1)) / Astro.DAY; return ((doy - 79.5) / 365.25) * 360; };
  const NEW_MOON = Date.UTC(1930, 0, 29, 19, 7), SYN = 29.530589 * Astro.DAY;
  const DSO = [[0.712, 41.27, 'M31', 'gal'], [5.588, -5.39, 'M42', 'neb'], [3.79, 24.1, 'Pleiades', 'cl'], [4.47, 15.87, 'Hyades', 'cl'], [8.67, 19.98, 'M44 Praesepe', 'cl'],
    [6.15, 24.33, 'M35', 'cl'], [16.69, 36.46, 'M13', 'cl'], [18.06, -24.38, 'M8', 'neb'], [18.61, -23.9, 'M22', 'cl'], [12.42, 26.1, 'Coma cluster', 'cl'], [17.9, -34.8, 'M7', 'cl'], [18.85, -6.27, 'M11', 'cl'], [1.56, 30.66, 'M33', 'gal']];
  const MIN_ALT = 25;

  function render(container, { t, hour = 23, plates, pins = [], onPick, onHour }) {
    const wrap = el('div'); wrap.id = 'skymap-wrap'; container.appendChild(wrap);
    const bar = el('div', 'hours'); wrap.appendChild(bar);
    [21, 23, 1, 3].forEach(h => { const b = el('button', h === hour ? 'primary' : '', `${String(h).padStart(2, '0')}:00`); b.onclick = () => onHour(h); bar.appendChild(b); });
    const info = el('span', 'coords'); bar.appendChild(info);
    const c = el('canvas'); c.id = 'skymap'; c.width = W; c.height = H; wrap.appendChild(c);
    const g = c.getContext('2d');
    const lst = Astro.lst(t, hour + (hour < 12 ? 24 : 0));
    const alt = (ra, dec) => Astro.altitude(ra, dec, lst);
    let cursor = null;
    const fw = dec => Astro.PLATE_RA_DEG / 15 / Math.max(0.4, Math.cos(dec * R)), fh = Astro.PLATE_DEC_DEG;
    const frame = (ra, dec) => ({ x: X(ra + fw(dec) / 2), y: Y(dec + fh / 2), w: X(ra - fw(dec) / 2) - X(ra + fw(dec) / 2), h: Y(dec - fh / 2) - Y(dec + fh / 2) });
    function draw() {
      g.fillStyle = '#0e1226'; g.fillRect(0, 0, W, H);
      // Milky Way
      g.strokeStyle = 'rgba(216,205,180,.06)'; g.lineWidth = 70; g.lineCap = 'round'; g.beginPath(); let px = null;
      for (let l = 0; l <= 360; l += 3) { const p = galRaDec(l, 0); const x = X(p.ra), y = Y(p.dec); if (px === null || Math.abs(x - px) > W / 2) g.moveTo(x, y); else g.lineTo(x, y); px = x; } g.stroke();
      // grid
      g.strokeStyle = 'rgba(216,205,180,.08)'; g.lineWidth = 1; g.font = '600 16px "IBM Plex Sans", sans-serif'; g.fillStyle = 'rgba(160,151,138,.8)'; g.textAlign = 'center';
      for (let h = 0; h < 24; h += 2) { g.beginPath(); g.moveTo(X(h), 0); g.lineTo(X(h), H); g.stroke(); g.fillText(`${h}h`, X(h), H - 6); }
      for (let d = -30; d <= 40; d += 10) { g.beginPath(); g.moveTo(0, Y(d)); g.lineTo(W, Y(d)); g.stroke(); g.textAlign = 'left'; g.fillText(`${d > 0 ? '+' : ''}${d}°`, 6, Y(d) - 4); g.textAlign = 'center'; }
      // stars
      BRIGHT_STARS.forEach(([ra, dec, m]) => { if (dec > DEC_TOP || dec < DEC_TOP - DEC_SPAN) return; const r = Math.max(0.5, (5.6 - m) * 0.62);
        g.fillStyle = `rgba(235,232,225,${Math.min(1, 0.25 + (5.6 - m) * 0.18)})`; g.beginPath(); g.arc(X(ra), Y(dec), r, 0, 7); g.fill(); });
      g.fillStyle = 'rgba(216,205,180,.75)'; g.textAlign = 'left';
      STAR_NAMES.forEach(([ra, dec, n]) => { if (dec > DEC_TOP || dec < DEC_TOP - DEC_SPAN) return; const m = BRIGHT_STARS.find(s => s[0] === ra && s[1] === dec); if (m && m[2] <= 1.35) g.fillText(n, X(ra) + 6, Y(dec) - 6); });
      // deep-sky landmarks
      DSO.forEach(([ra, dec, n, k]) => { if (dec > DEC_TOP) return; const x = X(ra), y = Y(dec); g.strokeStyle = 'rgba(150,190,220,.8)'; g.lineWidth = 1.2; g.beginPath();
        if (k === 'gal') g.ellipse(x, y, 9, 4, -0.5, 0, 7); else if (k === 'neb') g.rect(x - 5, y - 5, 10, 10); else { g.setLineDash([2, 2]); g.arc(x, y, 7, 0, 7); }
        g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(150,190,220,.85)'; g.fillText(n, x + 11, y + 5); });
      // ecliptic
      g.strokeStyle = 'rgba(214,104,92,.55)'; g.lineWidth = 1.2; g.setLineDash([6, 5]); g.beginPath(); px = null;
      for (let lon = 0; lon <= 360; lon += 2) { const p = eclRaDec(lon); const x = X(p.ra), y = Y(p.dec); if (px === null || Math.abs(x - px) > W / 2) g.moveTo(x, y); else g.lineTo(x, y); px = x; }
      g.stroke(); g.setLineDash([]);
      // planets
      Astro.planets(t).forEach(p => { if (p.dec > DEC_TOP) return; const x = X(p.ra), y = Y(p.dec); g.fillStyle = '#f0d9a0'; g.beginPath(); g.arc(x, y, p.name === 'Jupiter' || p.name === 'Venus' ? 5 : 3.5, 0, 7); g.fill();
        g.strokeStyle = 'rgba(240,217,160,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke(); g.fillStyle = 'rgba(240,217,160,.95)'; g.fillText(p.name, x + 12, y + 5); });
      // sun, opposition, moon
      const sl = sunLon(t), sp = eclRaDec(sl), op = eclRaDec(sl + 180);
      g.fillStyle = '#e8c76a'; g.beginPath(); g.arc(X(sp.ra), Y(sp.dec), 9, 0, 7); g.fill(); g.fillStyle = 'rgba(232,199,106,.9)'; g.fillText('Sun', X(sp.ra) + 12, Y(sp.dec) + 5);
      g.strokeStyle = 'rgba(214,104,92,.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(op.ra) - 10, Y(op.dec)); g.lineTo(X(op.ra) + 10, Y(op.dec)); g.moveTo(X(op.ra), Y(op.dec) - 10); g.lineTo(X(op.ra), Y(op.dec) + 10); g.stroke();
      g.fillStyle = 'rgba(214,104,92,.9)'; g.fillText('opposition', X(op.ra) + 12, Y(op.dec) - 8);
      const ph = ((((t - NEW_MOON) % SYN) + SYN) % SYN) / SYN, mp = eclRaDec(sl + ph * 360), ill = Astro.moonIllum(t);
      g.fillStyle = `rgba(230,228,220,${0.25 + ill * 0.7})`; g.beginPath(); g.arc(X(mp.ra), Y(mp.dec), 7, 0, 7); g.fill(); g.fillStyle = 'rgba(216,205,180,.8)'; g.fillText(`Moon ${Math.round(ill * 100)}%`, X(mp.ra) + 10, Y(mp.dec) + 18);
      // horizon mask for this hour
      g.fillStyle = 'rgba(3,3,5,.86)';
      for (let x = 0; x < W; x += 10) for (let y = 0; y < H; y += 10) { const ra = (1 - (x + 5) / W) * 24, dec = DEC_TOP - (y + 5) / H * DEC_SPAN; if (alt(ra, dec) < MIN_ALT) g.fillRect(x, y, 10, 10); }
      // hand-written plate labels
      g.strokeStyle = 'rgba(199,38,30,.9)'; g.lineWidth = 1.5;
      const done = new Set();
      plates.forEach(p => { const f = frame(p.ra, p.dec), col = p.labelled === false ? 'rgba(140,132,120,.8)' : 'rgba(199,38,30,.95)'; g.strokeStyle = col; g.lineWidth = 1.5; g.strokeRect(f.x, f.y, f.w, f.h); g.fillStyle = 'rgba(199,38,30,.10)'; g.fillRect(f.x, f.y, f.w, f.h);
        if (p.paired) g.strokeRect(f.x + 4, f.y + 4, f.w - 8, f.h - 8);
        const key = `${p.ra.toFixed(1)}|${p.dec.toFixed(0)}`; if (p.id && !done.has(key)) { done.add(key); g.fillStyle = col; g.textAlign = 'center'; g.fillText(p.labelled === false ? `No. ${p.id}, no label` : p.paired ? `No. ${Math.min(p.id, p.partner)} + ${Math.max(p.id, p.partner)}, pair` : `No. ${p.id}`, f.x + f.w / 2, f.y + f.h + 18); g.textAlign = 'left'; } });
      // the player's own notes with a position
      pins.forEach(n => { const x = X(n.ra), y = Y(n.dec); g.strokeStyle = 'rgba(216,205,180,.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x, y + 10); g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.stroke();
        g.fillStyle = 'rgba(216,205,180,.9)'; g.textAlign = 'left'; g.fillText(n.text, x + 12, y - 6); });
      // cursor frame
      if (cursor) { const f = frame(cursor.ra, cursor.dec), ok = alt(cursor.ra, cursor.dec) >= MIN_ALT; g.strokeStyle = ok ? '#fff' : 'rgba(160,151,138,.6)'; g.lineWidth = 2; g.setLineDash(ok ? [] : [4, 4]); g.strokeRect(f.x, f.y, f.w, f.h); g.setLineDash([]); }
      g.fillStyle = 'rgba(160,151,138,.8)'; g.textAlign = 'right'; g.fillText(`Flagstaff · ${String(hour).padStart(2, '0')}:00 MST · sidereal ${Astro.raStr(lst)} · shaded: below ${MIN_ALT}° or behind the pines`, W - 8, 20); g.textAlign = 'left';
    }
    const pos = e => { const r = c.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; return { ra: (1 - x / W) * 24, dec: DEC_TOP - y / H * DEC_SPAN }; };
    c.addEventListener('pointermove', e => { cursor = pos(e); const a = alt(cursor.ra, cursor.dec); c.style.cursor = a >= MIN_ALT ? 'crosshair' : 'not-allowed';
      info.textContent = `${Astro.fieldStr(cursor.ra, cursor.dec)} · ${Astro.nearestRegion(cursor.ra, cursor.dec).name} · altitude ${Math.round(a)}° · plate ${Astro.PLATE_RA_DEG}° × ${Astro.PLATE_DEC_DEG}°`; draw(); });
    c.addEventListener('pointerleave', () => { cursor = null; info.textContent = ''; draw(); });
    c.addEventListener('click', e => { const p = pos(e); if (alt(p.ra, p.dec) >= MIN_ALT) onPick(p.ra, p.dec); else toast('Too low. Below the pines, or in daylight.', 2200); });
    draw();
  }
  return { render };
})();
