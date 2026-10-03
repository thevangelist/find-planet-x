'use strict';
// The Zeiss blink comparator: the central mechanic.
const Blink = (() => {
  const MM = Sky.PX_PER_MM;

  function run(opts) {
    // opts: { spec, dates:[a,b], regionName, thirdPlate:boolean, focus:number, onFocus(fn), tutorial }
    return new Promise(resolve => {
      const scene = $('#scene'); scene.innerHTML = '';
      const wrap = el('div', '', `
        <div id="blink-wrap">
          <canvas id="blink-canvas"></canvas>
          <div id="blink-mode">Mounting the plates…</div>
          <div id="blink-left"></div>
          <div id="blink-side">
            <h3>Plate pair</h3>
            <div id="pair-info"></div>
            <canvas id="plate-map" width="270" height="220"></canvas>
            <h3>Suspects</h3>
            <div id="suspects"><span style="opacity:.5">No marks.</span></div>
            <h3>&nbsp;</h3>
            <button id="btn-pencil">Pencil / hand &nbsp;<span class="kbd">P</span></button>
            <button id="btn-neg">Negative / positive &nbsp;<span class="kbd">N</span></button>
            <div class="hints"><span class="kbd">left</span> plate A &nbsp;<span class="kbd">right</span> plate B &nbsp;<span class="kbd">space</span> switch<br><span class="kbd">W A S D</span> or right-drag moves · left-drag draws a pencil ring</div>
            <button id="btn-leave" class="primary">Leave the machine</button>
          </div>
        </div>`);
      scene.appendChild(wrap);
      const canvas = $('#blink-canvas'), g = canvas.getContext('2d');
      const map = $('#plate-map'), mg = map.getContext('2d');
      const size = Math.round(Math.min(window.innerHeight * 0.78, window.innerWidth * 0.5, 760));
      canvas.width = canvas.height = size;
      $('#pair-info').innerHTML = `${opts.regionName}<br>A: ${opts.dates[0]} &nbsp; B: ${opts.dates[1]}<br>interval ${opts.spec.days} days<br>third plate: ${opts.thirdPlate ? 'yes' : 'no'}`;

      let pair = null, plateIdx = 0, neg = false, pencil = true, stroke = null;
      const strokes = [];
      let vx = Sky.W / 2 - size / 2, vy = Sky.H / 2 - size / 2;
      const keys = {}, suspects = [], covered = new Set();
      const CX = 24, CY = 20, cellW = Sky.W / CX, cellH = Sky.H / CY;
      let focus = opts.focus, elapsed = 0, lastIdle = 0, running = true, dwell = 0, lastCell = '';

      setTimeout(() => { pair = Sky.buildPair(opts.spec); $('#blink-mode').textContent = ''; Audio_.loop('amb_search', 0.22, 4);
        // restore earlier marks of this pair; re-link to the (deterministic) movers by position
        (opts.restore || []).forEach(r => {
          let best = null, bd = 4;
          for (const m of pair.movers) { const d0 = Math.hypot(m.x - r.x, m.y - r.y), d1 = m.dx != null ? Math.hypot(m.x + m.dx - r.x, m.y + m.dy - r.y) : 99; const d = Math.min(d0, d1); if (d < bd) { bd = d; best = m; } }
          const st = r.stroke ? r.stroke.map(q => [q[0] + Sky.W / 2, q[1] + Sky.H / 2]) : null; if (st) strokes.push(st);
          suspects.push({ m: best, x: r.x, y: r.y, kind: r.kind, verdict: r.verdict, stroke: st, find: r.find || null, shift: best && best.dx != null ? Math.hypot(best.dx, best.dy) : 0 });
        });
        renderSuspects(); }, 60);

      const toMM = (px, py) => ({ x: px / MM - Sky.PLATE_W_MM / 2, y: py / MM - Sky.PLATE_H_MM / 2 });
      function mark(cx, cy, st) {
        if (!pair) return;
        const mm = toMM(vx + cx, vy + cy);
        let best = null, bd = 4;
        for (const m of pair.movers) {
          // suspect sits on either position (A or B)
          const d0 = Math.hypot(m.x - mm.x, m.y - mm.y), d1 = m.dx != null ? Math.hypot(m.x + m.dx - mm.x, m.y + m.dy - mm.y) : 99;
          const d = Math.min(d0, d1); if (d < bd) { bd = d; best = m; }
        }
        if (best && suspects.some(s => s.m === best)) { toast('Already marked.'); return; }
        if (st) strokes.push(st);
        const s = { m: best, x: mm.x, y: mm.y, kind: best ? best.kind : 'star', verdict: null, stroke: st, find: best && best.find ? best.find.id : null,
          shift: best && best.dx != null ? Math.hypot(best.dx, best.dy) : 0 };
        if (s.kind === 'star') s.verdict = 'a star, does not move';
        if (s.kind === 'variable') s.verdict = 'same place on both plates, three magnitudes brighter on B: a variable star';
        suspects.push(s); Audio_.play('pencil_write', 0.5); renderSuspects();
      }
      function renderSuspects() {
        const box = $('#suspects'); box.innerHTML = '';
        if (!suspects.length) { box.innerHTML = '<span style="opacity:.5">No marks.</span>'; return; }
        suspects.forEach((s, i) => {
          const row = el('div', 'suspect');
          const shift = s.kind === 'star' || s.kind === 'variable' ? '' : ` &nbsp;Δ ${s.shift.toFixed(1)} mm`;
          row.innerHTML = `<span>#${i + 1} &nbsp;x ${s.x.toFixed(1)} &nbsp;y ${s.y.toFixed(1)}${shift}<br><span class="v">${s.verdict ?? ''}</span></span>`;
          if (!s.verdict) {
            const b = el('button', '', 'Check'); b.disabled = !opts.thirdPlate;
            b.title = opts.thirdPlate ? 'Compare against the third plate' : 'You need a third plate of the same region';
            b.onclick = () => check(s); row.appendChild(b);
          }
          box.appendChild(row);
        });
      }
      async function check(s) {
        Audio_.play('glass_plate_set', 0.5); toast('Mounting the third plate…', 2500);
        await wait(2600);
        if (s.kind === 'asteroid') { s.verdict = s.find ? 'asteroid, fast and not on any list: new' : 'asteroid: far off on the third plate, already catalogued'; }
        else if (s.kind === 'comet') { s.verdict = 'diffuse, with a tail, moving: a comet'; }
        else if (s.kind === 'defect') { s.verdict = 'not on the third plate: emulsion flaw'; }
        else if (s.kind === 'pluto') { s.verdict = 'the shift matches'; renderSuspects(); await discovery(s); return; }
        renderSuspects();
      }
      async function discovery(s) {
        running = false; hold = true;
        Audio_.stop('amb_search', 4);
        // centre the view on it, blink a few more times slowly, then silence
        const p = Sky.mmToPx(s.m); vx = p.x - size / 2; vy = p.y - size / 2;
        for (let i = 0; i < 6; i++) { plateIdx = i % 2; draw(); Audio_.click(0.14, 1500, 0.03); await wait(900); }
        plateIdx = 0; draw();
        const ov = el('div', 'overlay-text', '<p></p>'); scene.appendChild(ov);
        await wait(3500);
        Audio_.swell(70);
        ov.querySelector('p').textContent = TEXT.discovery.quote; ov.querySelector('p').classList.add('on');
        await wait(5000);
        finish({ found: true, suspects, minutes: Math.round(elapsed / 60 * 50) });
      }
      const packStroke = st => st ? st.filter((q, i) => i % 2 === 0 || i === st.length - 1).map(q => [Math.round(q[0] - Sky.W / 2), Math.round(q[1] - Sky.H / 2)]) : null;
      function finish(res) {
        res.suspects = res.suspects.map(s => ({ x: s.x, y: s.y, kind: s.kind, verdict: s.verdict, find: s.find || null, stroke: packStroke(s.stroke) }));
        running = false; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
        window.removeEventListener('resize', onResize); resolve({ ...res, focus });
      }

      // ---- drawing ----
      function draw() {
        g.fillStyle = '#060708'; g.fillRect(0, 0, size, size);
        if (!pair) return;
        const src = plateIdx ? pair.b : pair.a;
        g.drawImage(src, vx, vy, size, size, 0, 0, size, size);
        if (focus < 0.45) { g.fillStyle = `rgba(6,7,8,${(0.45 - focus) * 0.9})`; g.fillRect(0, 0, size, size); }
        // faint measuring cross of the comparator stage
        g.strokeStyle = 'rgba(214,104,92,.14)'; g.lineWidth = 1; g.beginPath();
        g.moveTo(size / 2, 0); g.lineTo(size / 2, size); g.moveTo(0, size / 2); g.lineTo(size, size / 2); g.stroke();
        // suspect marks
        g.lineCap = 'round'; g.lineJoin = 'round';
        const drawStroke = (st, live) => { if (st.length < 2) return; g.strokeStyle = live ? 'rgba(70,66,60,.9)' : 'rgba(60,56,50,.85)'; g.lineWidth = 2.2;
          g.beginPath(); st.forEach((q, i) => { const x = q[0] - vx + (i % 3) * 0.3, y = q[1] - vy; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
          g.strokeStyle = 'rgba(120,114,100,.35)'; g.lineWidth = 0.8; g.stroke(); };
        strokes.forEach(st => drawStroke(st, false)); if (stroke) drawStroke(stroke, true);
        g.strokeStyle = 'rgba(200,60,40,.8)'; g.lineWidth = 1;
        suspects.forEach(s => { if (s.stroke) return; const p = Sky.mmToPx(s); const x = p.x - vx, y = p.y - vy; if (x < -20 || y < -20 || x > size + 20 || y > size + 20) return;
          g.beginPath(); g.arc(x, y, 14, 0, 7); g.stroke(); });
        drawMap();
      }
      function drawMap() {
        const sx = map.width / Sky.W, sy = map.height / Sky.H;
        mg.fillStyle = '#0b0c0e'; mg.fillRect(0, 0, map.width, map.height);
        mg.fillStyle = 'rgba(216,205,180,.14)';
        covered.forEach(k => { const [i, j] = k.split(',').map(Number); mg.fillRect(i * cellW * sx, j * cellH * sy, cellW * sx + .5, cellH * sy + .5); });
        mg.strokeStyle = '#d6685c'; mg.lineWidth = 1; mg.strokeRect(vx * sx, vy * sy, size * sx, size * sy);
        mg.fillStyle = '#c7261e'; suspects.forEach(s => { const p = Sky.mmToPx(s); mg.fillRect(p.x * sx - 1.5, p.y * sy - 1.5, 3, 3); });
      }

      let last = performance.now();
      function frame(now) {
        if (!running) return;
        const dt = (now - last) / 1000; last = now;
        elapsed += dt;
        // pan with keys
        const sp = 260 * dt; if (keys.a) vx -= sp; if (keys.d) vx += sp; if (keys.w) vy -= sp; if (keys.s) vy += sp;
        vx = clamp(vx, 0, Sky.W - size); vy = clamp(vy, 0, Sky.H - size);
        // coverage: dwell on a cell
        const cell = `${Math.floor((vx + size / 2) / cellW)},${Math.floor((vy + size / 2) / cellH)}`;
        if (cell === lastCell) { dwell += dt; if (dwell > 0.5) { covered.add(cell); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const [i, j] = cell.split(',').map(Number); if (i + di >= 0 && j + dj >= 0 && i + di < CX && j + dj < CY) covered.add(`${i + di},${j + dj}`); } } } else { dwell = 0; lastCell = cell; }
        // concentration decays slowly while blinking
        focus = clamp(focus - dt / 900, 0, 1);
        if (elapsed - lastIdle > 45) { lastIdle = elapsed; toast(TEXT.blinkIdle[Math.floor(Math.random() * TEXT.blinkIdle.length)]); if (Math.random() < .4) Audio_.play('chair_creak', 0.3); }
        $('#blink-left').innerHTML = `<b>${opts.regionName}</b><br>field ${(size / MM).toFixed(0)} mm<br><span class="plate-id">PLATE ${plateIdx ? 'B' : 'A'}</span><br>concentration ${focus > .66 ? 'good' : focus > .33 ? 'fair' : 'poor'}`;
        if (opts.onTick) opts.onTick(elapsed, focus);
        draw(); requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);

      // ---- input ----
      const setPlate = want => { if (plateIdx !== want) { plateIdx = want; if (pair) Audio_.click(0.14, 1500, 0.03); } };
      const kd = e => { keys[e.key] = true;
        if (e.key === ' ') { e.preventDefault(); if (!e.repeat) setPlate(plateIdx ^ 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); setPlate(0); } if (e.key === 'ArrowRight') { e.preventDefault(); setPlate(1); }
        if (e.key === 'n' || e.key === 'N') toggleNeg(); if (e.key === 'p' || e.key === 'P') togglePencil(); };
      const ku = e => { keys[e.key] = false; };
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
      let drag = null;
      const local = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * size / r.width, (e.clientY - r.top) * size / r.height]; };
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId);
        const pan = e.button !== 0 || e.shiftKey || !pencil;
        if (!pan) { const [x, y] = local(e); stroke = [[x + vx, y + vy]]; Audio_.play('pencil_write', 0.35); return; }
        drag = { x: e.clientX, y: e.clientY, vx, vy, moved: false }; });
      canvas.addEventListener('pointermove', e => {
        if (stroke) { const [x, y] = local(e); const l = stroke[stroke.length - 1]; if (Math.hypot(x + vx - l[0], y + vy - l[1]) > 2) stroke.push([x + vx, y + vy]); return; }
        if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) drag.moved = true; vx = clamp(drag.vx - dx, 0, Sky.W - size); vy = clamp(drag.vy - dy, 0, Sky.H - size); });
      canvas.addEventListener('pointerup', e => {
        if (stroke) { const st = stroke; stroke = null; const cx = st.reduce((a, q) => a + q[0], 0) / st.length - vx, cy = st.reduce((a, q) => a + q[1], 0) / st.length - vy; mark(cx, cy, st); return; }
        if (drag && !drag.moved) { const [x, y] = local(e); mark(x, y); } drag = null; });
      const togglePencil = () => { pencil = !pencil; canvas.style.cursor = pencil ? 'cell' : 'grab'; $('#btn-pencil').classList.toggle('primary', pencil); toast(pencil ? 'Pencil in hand. Draw a ring around a suspect.' : 'Hand: drag to move the plate.', 1500); };
      $('#btn-pencil').onclick = togglePencil; $('#btn-pencil').classList.add('primary'); canvas.style.cursor = 'cell';
      const toggleNeg = () => { neg = !neg; canvas.classList.toggle('negative', neg); Prefs.set('negative', neg); };
      if (Prefs.get('negative')) toggleNeg();
      $('#btn-neg').onclick = toggleNeg;
      $('#btn-leave').onclick = () => { Audio_.stop('amb_search'); Audio_.play('chair_creak', 0.4); finish({ found: false, suspects, minutes: Math.round(elapsed / 60 * 50) }); };
      const onResize = () => {}; window.addEventListener('resize', onResize);
    });
  }
  return { run };
})();
