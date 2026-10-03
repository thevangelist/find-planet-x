'use strict';
// Guiding a one-hour exposure by hand in the unheated dome.
const Expose = (() => {
  function run(opts) {
    // opts: { regionName, minutes, tempC }
    return new Promise(resolve => {
      const scene = $('#scene'); scene.innerHTML = '';
      const c = el('canvas'); c.id = 'expose-canvas'; scene.appendChild(c);
      const info = el('div', 'expose-info'); scene.appendChild(info);
      const cap = el('div', 'caption'); cap.style.left = 'auto'; cap.style.width = '34vw'; scene.appendChild(cap);
      const g = c.getContext('2d');
      const fit = () => { c.width = window.innerWidth; c.height = window.innerHeight; }; fit(); window.addEventListener('resize', fit);
      const SEC_PER_MIN = 0.14, total = opts.minutes;   // an hour of guiding in about eight seconds
      let minutes = 0, pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 }, errSec = 0, t0 = performance.now(), last = t0, phase = Math.random() * 6, running = true, lastLine = -8;
      const inner = 18, ruinAt = 5; let nextGust = 0.9 + Math.random() * 1.2; let meteor = null, nextMeteor = Math.random() < 0.08 ? 1.5 + Math.random() * 5 : Infinity;   // a meteor on one exposure in twelve, now and then a bright one
      const FOV = 2.2, cosd = Math.cos((opts.dec || 0) * Math.PI / 180);
      const real = (typeof BRIGHT_STARS !== 'undefined' && opts.ra != null) ? BRIGHT_STARS.map(s => { let dra = (s[0] - opts.ra); if (dra > 12) dra -= 24; if (dra < -12) dra += 24; return { x: 0.5 - dra * 15 * cosd / FOV, y: 0.5 - (s[1] - opts.dec) / FOV, m: Math.max(0.2, (6 - s[2]) / 6) }; }).filter(s => s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1) : [];
      const rr = rng(hashStr('ep' + (opts.ra || 0).toFixed(2) + (opts.dec || 0).toFixed(1)));
      const MAGP = { Mercury: 0.2, Venus: -4.0, Mars: 0.5, Jupiter: -2.3, Saturn: 0.7, Uranus: 5.7, Neptune: 7.8 };
      const pls = (opts.planets || []).map(p => { let dra = p.ra - opts.ra; if (dra > 12) dra -= 24; if (dra < -12) dra += 24; return { x: 0.5 - dra * 15 * cosd / FOV, y: 0.5 - (p.dec - opts.dec) / FOV, m: Math.min(1.6, Math.max(0.5, (7 - MAGP[p.name]) / 6)), planet: p.name }; }).filter(s => s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1);
      const stars = pls.concat(real).concat(Array.from({ length: 140 }, () => ({ x: rr(), y: rr(), m: rr() * 0.45 })));
      Audio_.loop('amb_dome', 0.3, 3); Audio_.loop('wind', 0.35, 4);

      function nudge(dx, dy) { vel.x += dx * 14; vel.y += dy * 14; Audio_.play('telescope_click', 0.35, 5); }
      const kd = e => { const k = e.key; if (k === 'ArrowLeft' || k === 'a') nudge(1, 0); else if (k === 'ArrowRight' || k === 'd') nudge(-1, 0); else if (k === 'ArrowUp' || k === 'w') nudge(0, 1); else if (k === 'ArrowDown' || k === 's') nudge(0, -1); else if (k === 'Escape') end(true); else return; e.preventDefault(); };
      window.addEventListener('keydown', kd);
      c.addEventListener('pointerdown', e => { const dx = e.clientX - c.width / 2, dy = e.clientY - c.height / 2; nudge(-Math.sign(dx) * (Math.abs(dx) > 20), -Math.sign(dy) * (Math.abs(dy) > 20)); });

      function end(ruined) {
        running = false; window.removeEventListener('keydown', kd); window.removeEventListener('resize', fit);
        Audio_.stop('wind'); resolve({ ruined, minutes: Math.round(minutes) });
      }
      function frame(now) {
        if (!running) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now; minutes += dt / SEC_PER_MIN;
        // periodic drive error + wind gusts + slow drift
        phase += dt * 0.7;
        const drive = { x: Math.sin(phase) * 9, y: Math.cos(phase * 0.6) * 4 };
        // calm guiding, then a jolt: the drive catches, a gust hits the dome, a hand on the rail. Correct it, then it is quiet again.
        const wk = (opts.wind ? 1.6 : 1) * (opts.tired ? 1.4 : 1);
        if (minutes * SEC_PER_MIN >= nextGust) { nextGust += (opts.wind ? 1.2 : 1.8) + Math.random() * 1.2; const a = Math.random() * Math.PI * 2, k = (10 + Math.random() * 10) * wk; vel.x += Math.cos(a) * k; vel.y += Math.sin(a) * k; Audio_.play('breath_cold', 0.2); }
        vel.x += (Math.random() - .5) * 4 * wk * dt + 0.9 * dt; vel.y += (Math.random() - .5) * 4 * wk * dt + 0.4 * dt;
        vel.x *= 0.985; vel.y *= 0.985; pos.x += vel.x * dt; pos.y += vel.y * dt;
        const sx = pos.x + drive.x * 0.3, sy = pos.y + drive.y * 0.3, off = Math.hypot(sx, sy);
        window.__guide = { sx, sy }; // test hook
        if (off > inner) errSec += dt;
        if (errSec > ruinAt) { toast('The guide star drifted for too long. The stars have trailed into lines.', 4000); return end(true); }
        if (minutes >= total) { toast('Exposure complete. Shutter closed, plate into the holder.', 3500); Audio_.play('glass_plate_set', 0.5); return end(false); }
        if (minutes - lastLine > 25) { lastLine = minutes; if (Math.random() < .5) Audio_.play('breath_cold', 0.2); }
        // draw eyepiece
        const W = c.width, H = c.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.34;
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
        g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H);
        stars.forEach(s => { const x = cx + (s.x - .5) * R * 2.2 + sx, y = cy + (s.y - .5) * R * 2.2 + sy, size = 1 + s.m * 2.2;
          const rx = x - cx, ry = y - cy, rd = Math.hypot(rx, ry) / R, ca = rd * rd * 2.2;
          if (ca > 0.3) { const ux = rx / (rd * R + 1e-6), uy = ry / (rd * R + 1e-6);
            g.fillStyle = `rgba(255,80,60,${0.12 + s.m * 0.3})`; g.fillRect(x + ux * ca, y + uy * ca, size, size);
            g.fillStyle = `rgba(80,120,255,${0.12 + s.m * 0.3})`; g.fillRect(x - ux * ca, y - uy * ca, size, size); }
          g.fillStyle = `rgba(230,228,220,${0.2 + s.m * 0.6})`; g.fillRect(x, y, size, size); });
        // now and then a meteor crosses the field, a faint streak gone in a blink
        const tsec = minutes * SEC_PER_MIN;
        if (!meteor && tsec > nextMeteor) { nextMeteor = Infinity; const a = Math.random() * Math.PI * 2; meteor = { x: cx + (Math.random() - .5) * R * 1.4, y: cy + (Math.random() - .5) * R * 1.4, dx: Math.cos(a) * R * 2.6, dy: Math.sin(a) * R * 2.6, t0: tsec, life: 0.25 + Math.random() * 0.2, bright: Math.random() < 0.25 ? 2.2 : 1 }; }
        if (meteor) { const u = (tsec - meteor.t0) / meteor.life; if (u > 1) meteor = null; else { const x1 = meteor.x + meteor.dx * u, y1 = meteor.y + meteor.dy * u, x0 = x1 - meteor.dx * 0.18, y0 = y1 - meteor.dy * 0.18;
          const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, 'rgba(230,228,220,0)'); lg.addColorStop(1, `rgba(235,232,222,${Math.min(1, 0.55 * meteor.bright) * (1 - u)})`); g.strokeStyle = lg; g.lineWidth = 1.2 * meteor.bright; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); } }
        // guide star
        const gr = g.createRadialGradient(cx + sx, cy + sy, 0, cx + sx, cy + sy, 4); gr.addColorStop(0, 'rgba(235,232,222,.95)'); gr.addColorStop(.5, 'rgba(225,220,205,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(cx + sx, cy + sy, 4, 0, 7); g.fill();
        // cross-wires of the guiding eyepiece, faintly lit: a double wire with a gap for the star to sit in
        g.strokeStyle = 'rgba(200,190,170,.35)'; g.lineWidth = 1;
        [[-inner, 0], [inner, 0]].forEach(([dx]) => { g.beginPath(); g.moveTo(cx + dx, cy - R); g.lineTo(cx + dx, cy + R); g.stroke(); });
        [[0, -inner], [0, inner]].forEach(([, dy]) => { g.beginPath(); g.moveTo(cx - R, cy + dy); g.lineTo(cx + R, cy + dy); g.stroke(); });

        g.restore();
        g.strokeStyle = '#1d1a14'; g.lineWidth = 10; g.beginPath(); g.arc(cx, cy, R + 5, 0, 7); g.stroke();
        info.innerHTML = `<b>${opts.regionName}</b><br>${String(Math.floor(minutes)).padStart(2, '0')} of ${total} minutes<br>${opts.tempC} °C${opts.wind ? ', wind' : ''}${opts.haze ? ', thin cloud' : ''}`;
        requestAnimationFrame(frame);
      }
      function showLine(t) { cap.innerHTML = `<p>${t}</p>`; requestAnimationFrame(() => cap.querySelector('p').classList.add('on')); setTimeout(() => { const p = cap.querySelector('p'); if (p) p.classList.remove('on'); }, 5000); }
      requestAnimationFrame(frame);
    });
  }
  return { run };
})();
